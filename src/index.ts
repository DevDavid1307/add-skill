#!/usr/bin/env node

import { program } from 'commander';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { parseSource, cloneRepo, cleanupTempDir } from './git.js';
import { discoverSkills, getSkillDisplayName } from './skills.js';
import { installSkillForAgent, isSkillInstalled, getInstallPath } from './installer.js';
import { detectInstalledAgents, agents } from './agents.js';
import { track, setVersion } from './telemetry.js';
import { getFavourites, addFavourite, removeFavourite } from './favourites.js';
import type { Skill, AgentType, Favourite } from './types.js';
import packageJson from '../package.json' with { type: 'json' };

const version = packageJson.version;
setVersion(version);

interface Options {
  global?: boolean;
  agent?: string[];
  yes?: boolean;
  skill?: string[];
  list?: boolean;
  favourites?: boolean;
}

program
  .name('add-skill')
  .description('Install skills onto coding agents (OpenCode, Claude Code, Codex, Cursor, Antigravity)')
  .version(version)
  .argument('[source]', 'Git repo URL, GitHub shorthand (owner/repo), or direct path to skill')
  .option('-g, --global', 'Install skill globally (user-level) instead of project-level')
  .option('-a, --agent <agents...>', 'Specify agents to install to (opencode, claude-code, codex, cursor)')
  .option('-s, --skill <skills...>', 'Specify skill names to install (skip selection prompt)')
  .option('-l, --list', 'List available skills in the repository without installing')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('-f, --favourites', 'Manage favourite repositories')
  .action(async (source: string | undefined, options: Options) => {
    if (options.favourites) {
      await manageFavourites(options);
    } else if (source) {
      await main(source, options);
    } else {
      console.log();
      p.intro(chalk.bgCyan.black(' add-skill '));
      p.log.error('No source provided. Use -f to manage favourites or provide a source.');
      p.outro(chalk.dim('Run add-skill --help for usage information'));
      process.exit(1);
    }
  });

program.parse();

async function main(source: string, options: Options) {
  console.log();
  p.intro(chalk.bgCyan.black(' add-skill '));

let tempDir: string | null = null;

  try {
    const spinner = p.spinner();

    spinner.start('Parsing source...');
    const parsed = parseSource(source);
    spinner.stop(`Source: ${chalk.cyan(parsed.url)}${parsed.subpath ? ` (${parsed.subpath})` : ''}`);

    spinner.start('Cloning repository...');
    tempDir = await cloneRepo(parsed.url);
    spinner.stop('Repository cloned');

    spinner.start('Discovering skills...');
    const skills = await discoverSkills(tempDir, parsed.subpath);

    if (skills.length === 0) {
      spinner.stop(chalk.red('No skills found'));
      p.outro(chalk.red('No valid skills found. Skills require a SKILL.md with name and description.'));
      await cleanup(tempDir);
      process.exit(1);
    }

    spinner.stop(`Found ${chalk.green(skills.length)} skill${skills.length > 1 ? 's' : ''}`);

    if (options.list) {
      console.log();
      p.log.step(chalk.bold('Available Skills'));
      for (const skill of skills) {
        p.log.message(`  ${chalk.cyan(getSkillDisplayName(skill))}`);
        p.log.message(`    ${chalk.dim(skill.description)}`);
      }
      console.log();
      p.outro('Use --skill <name> to install specific skills');
      await cleanup(tempDir);
      process.exit(0);
    }

    let selectedSkills: Skill[];

    if (options.skill && options.skill.length > 0) {
      selectedSkills = skills.filter(s =>
        options.skill!.some(name =>
          s.name.toLowerCase() === name.toLowerCase() ||
          getSkillDisplayName(s).toLowerCase() === name.toLowerCase()
        )
      );

      if (selectedSkills.length === 0) {
        p.log.error(`No matching skills found for: ${options.skill.join(', ')}`);
        p.log.info('Available skills:');
        for (const s of skills) {
          p.log.message(`  - ${getSkillDisplayName(s)}`);
        }
        await cleanup(tempDir);
        process.exit(1);
      }

      p.log.info(`Selected ${selectedSkills.length} skill${selectedSkills.length !== 1 ? 's' : ''}: ${selectedSkills.map(s => chalk.cyan(getSkillDisplayName(s))).join(', ')}`);
    } else if (skills.length === 1) {
      selectedSkills = skills;
      const firstSkill = skills[0]!;
      p.log.info(`Skill: ${chalk.cyan(getSkillDisplayName(firstSkill))}`);
      p.log.message(chalk.dim(firstSkill.description));
    } else if (options.yes) {
      selectedSkills = skills;
      p.log.info(`Installing all ${skills.length} skills`);
    } else {
      const skillChoices = skills.map(s => ({
        value: s,
        label: getSkillDisplayName(s),
        hint: s.description.length > 60 ? s.description.slice(0, 57) + '...' : s.description,
      }));

      const selected = await p.multiselect({
        message: 'Select skills to install',
        options: skillChoices,
        required: true,
      });

      if (p.isCancel(selected)) {
        p.cancel('Installation cancelled');
        await cleanup(tempDir);
        process.exit(0);
      }

      selectedSkills = selected as Skill[];
    }

    let targetAgents: AgentType[];

    if (options.agent && options.agent.length > 0) {
      const validAgents = ['opencode', 'claude-code', 'codex', 'cursor', 'antigravity'];
      const invalidAgents = options.agent.filter(a => !validAgents.includes(a));

      if (invalidAgents.length > 0) {
        p.log.error(`Invalid agents: ${invalidAgents.join(', ')}`);
        p.log.info(`Valid agents: ${validAgents.join(', ')}`);
        await cleanup(tempDir);
        process.exit(1);
      }

      targetAgents = options.agent as AgentType[];
    } else {
      spinner.start('Detecting installed agents...');
      const installedAgents = await detectInstalledAgents();
      spinner.stop(`Detected ${installedAgents.length} agent${installedAgents.length !== 1 ? 's' : ''}`);

      if (installedAgents.length === 0) {
        if (options.yes) {
          targetAgents = ['opencode', 'claude-code', 'codex', 'cursor', 'antigravity'];
          p.log.info('Installing to all agents (none detected)');
        } else {
          p.log.warn('No coding agents detected. You can still install skills.');

          const allAgentChoices = Object.entries(agents).map(([key, config]) => ({
            value: key as AgentType,
            label: config.displayName,
          }));

          const selected = await p.multiselect({
            message: 'Select agents to install skills to',
            options: allAgentChoices,
            required: true,
          });

          if (p.isCancel(selected)) {
            p.cancel('Installation cancelled');
            await cleanup(tempDir);
            process.exit(0);
          }

          targetAgents = selected as AgentType[];
        }
      } else if (installedAgents.length === 1 || options.yes) {
        targetAgents = installedAgents;
        if (installedAgents.length === 1) {
          const firstAgent = installedAgents[0]!;
          p.log.info(`Installing to: ${chalk.cyan(agents[firstAgent].displayName)}`);
        } else {
          p.log.info(`Installing to: ${installedAgents.map(a => chalk.cyan(agents[a].displayName)).join(', ')}`);
        }
      } else {
        const agentChoices = installedAgents.map(a => ({
          value: a,
          label: agents[a].displayName,
          hint: `${options.global ? agents[a].globalSkillsDir : agents[a].skillsDir}`,
        }));

        const selected = await p.multiselect({
          message: 'Select agents to install skills to',
          options: agentChoices,
          required: true,
          initialValues: installedAgents,
        });

        if (p.isCancel(selected)) {
          p.cancel('Installation cancelled');
          await cleanup(tempDir);
          process.exit(0);
        }

        targetAgents = selected as AgentType[];
      }
    }

    let installGlobally = options.global ?? false;

    if (options.global === undefined && !options.yes) {
      const scope = await p.select({
        message: 'Installation scope',
        options: [
          { value: false, label: 'Project', hint: 'Install in current directory (committed with your project)' },
          { value: true, label: 'Global', hint: 'Install in home directory (available across all projects)' },
        ],
      });

      if (p.isCancel(scope)) {
        p.cancel('Installation cancelled');
        await cleanup(tempDir);
        process.exit(0);
      }

      installGlobally = scope as boolean;
    }

    console.log();
    p.log.step(chalk.bold('Installation Summary'));

    for (const skill of selectedSkills) {
      p.log.message(`  ${chalk.cyan(getSkillDisplayName(skill))}`);
      for (const agent of targetAgents) {
        const path = getInstallPath(skill.name, agent, { global: installGlobally });
        const installed = await isSkillInstalled(skill.name, agent, { global: installGlobally });
        const status = installed ? chalk.yellow(' (will overwrite)') : '';
        p.log.message(`    ${chalk.dim('→')} ${agents[agent].displayName}: ${chalk.dim(path)}${status}`);
      }
    }
    console.log();

    if (!options.yes) {
      const confirmed = await p.confirm({ message: 'Proceed with installation?' });

      if (p.isCancel(confirmed) || !confirmed) {
        p.cancel('Installation cancelled');
        await cleanup(tempDir);
        process.exit(0);
      }
    }

    spinner.start('Installing skills...');

    const results: { skill: string; agent: string; success: boolean; path: string; error?: string }[] = [];

    for (const skill of selectedSkills) {
      for (const agent of targetAgents) {
        const result = await installSkillForAgent(skill, agent, { global: installGlobally });
        results.push({
          skill: getSkillDisplayName(skill),
          agent: agents[agent].displayName,
          ...result,
        });
      }
    }

    spinner.stop('Installation complete');

    console.log();
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    // Track installation result
    track({
      event: 'install',
      source,
      skills: selectedSkills.map(s => s.name).join(','),
      agents: targetAgents.join(','),
      ...(installGlobally && { global: '1' }),
    });

    if (successful.length > 0) {
      p.log.success(chalk.green(`Successfully installed ${successful.length} skill${successful.length !== 1 ? 's' : ''}`));
      for (const r of successful) {
        p.log.message(`  ${chalk.green('✓')} ${r.skill} → ${r.agent}`);
        p.log.message(`    ${chalk.dim(r.path)}`);
      }
    }

    if (failed.length > 0) {
      console.log();
      p.log.error(chalk.red(`Failed to install ${failed.length} skill${failed.length !== 1 ? 's' : ''}`));
      for (const r of failed) {
        p.log.message(`  ${chalk.red('✗')} ${r.skill} → ${r.agent}`);
        p.log.message(`    ${chalk.dim(r.error)}`);
      }
    }

    console.log();
    p.outro(chalk.green('Done!'));
  } catch (error) {
    p.log.error(error instanceof Error ? error.message : 'Unknown error occurred');
    p.outro(chalk.red('Installation failed'));
    process.exit(1);
  } finally {
    await cleanup(tempDir);
  }
}

async function cleanup(tempDir: string | null) {
  if (tempDir) {
    try {
      await cleanupTempDir(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function manageFavourites(options: Options) {
  console.log();
  p.intro(chalk.bgCyan.black(' add-skill ') + chalk.dim(' favourites'));

  while (true) {
    const action = await p.select({
      message: 'What would you like to do?',
      options: [
        { value: 'list', label: 'List favourites', hint: 'View all saved favourite repositories' },
        { value: 'add', label: 'Add favourite', hint: 'Save a new repository to favourites' },
        { value: 'remove', label: 'Remove favourite', hint: 'Delete a repository from favourites' },
        { value: 'install', label: 'Install from favourite', hint: 'Install skills from a favourite repository' },
        { value: 'exit', label: 'Exit', hint: 'Return to terminal' },
      ],
    });

    if (p.isCancel(action) || action === 'exit') {
      p.outro(chalk.dim('Goodbye!'));
      process.exit(0);
    }

    if (action === 'list') {
      await listFavourites();
    } else if (action === 'add') {
      await promptAddFavourite();
    } else if (action === 'remove') {
      await promptRemoveFavourite();
    } else if (action === 'install') {
      await promptInstallFromFavourite(options);
    }

    console.log();
  }
}

async function listFavourites() {
  const favourites = await getFavourites();

  if (favourites.length === 0) {
    p.log.warn('No favourites saved yet. Add one with "Add favourite".');
    return;
  }

  console.log();
  p.log.step(chalk.bold('Your Favourites'));
  for (const fav of favourites) {
    p.log.message(`  ${chalk.cyan(fav.repo)}`);
    p.log.message(`    ${chalk.dim(fav.description)}`);
  }
}

async function promptAddFavourite() {
  const repo = await p.text({
    message: 'Repository (e.g., owner/repo or full URL)',
    placeholder: 'owner/repo',
    validate: (value) => {
      if (!value.trim()) return 'Repository is required';
      return undefined;
    },
  });

  if (p.isCancel(repo)) return;

  const description = await p.text({
    message: 'Description',
    placeholder: 'What does this repository contain?',
    validate: (value) => {
      if (!value.trim()) return 'Description is required';
      return undefined;
    },
  });

  if (p.isCancel(description)) return;

  const favourite = await addFavourite(repo as string, description as string);
  p.log.success(`Added ${chalk.cyan(favourite.repo)} to favourites`);
}

async function promptRemoveFavourite() {
  const favourites = await getFavourites();

  if (favourites.length === 0) {
    p.log.warn('No favourites to remove.');
    return;
  }

  const selected = await p.select({
    message: 'Select favourite to remove',
    options: favourites.map(fav => ({
      value: fav,
      label: fav.repo,
      hint: fav.description.length > 50 ? fav.description.slice(0, 47) + '...' : fav.description,
    })),
  });

  if (p.isCancel(selected)) return;

  const fav = selected as Favourite;
  const confirmed = await p.confirm({
    message: `Remove ${chalk.cyan(fav.repo)} from favourites?`,
  });

  if (p.isCancel(confirmed) || !confirmed) return;

  await removeFavourite(fav.id);
  p.log.success(`Removed ${chalk.cyan(fav.repo)} from favourites`);
}

async function promptInstallFromFavourite(options: Options) {
  const favourites = await getFavourites();

  if (favourites.length === 0) {
    p.log.warn('No favourites to install from. Add one first.');
    return;
  }

  const selected = await p.select({
    message: 'Select favourite to install from',
    options: favourites.map(fav => ({
      value: fav,
      label: fav.repo,
      hint: fav.description.length > 50 ? fav.description.slice(0, 47) + '...' : fav.description,
    })),
  });

  if (p.isCancel(selected)) return;

  const fav = selected as Favourite;
  console.log();
  await main(fav.repo, options);
}
