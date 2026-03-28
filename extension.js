/*
* @file: extension.js
* @description: This file contains the main source code for the DeveloperInterface VSCode extension.
* @author: Walid A.
* @version: dev-0.0.1-1
* @date: 28/03/2026
*/

// Import necessary modules
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// Global variables
let allConfigs = []; // array of { filePath, config }
let treeDataProvider = null;

// -----------------------------------------------------------------
// Default tasks used when creating a new template
// -----------------------------------------------------------------
const defaultTasks = [
  {
    label: 'Build',
    description: 'Compile project',
    command: 'echo "Build command here"',
    icon: 'tools'
  },
  {
    label: 'Run',
    description: 'Start application',
    command: 'echo "Run command here"',
    icon: 'play'
  },
  {
    label: 'Test',
    description: 'Run test suite',
    command: 'echo "Test command here"',
    icon: 'check'
  }
];

// -----------------------------------------------------------------
// Tree data provider — one collapsible group per config file
// -----------------------------------------------------------------
class TaskTreeDataProvider {
  constructor(configs) {
    this.configs = configs;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  getTreeItem(element) {
    if (element.type === 'group') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon(element.icon || 'list');
      item.tooltip = element.filePath;
      item.contextValue = 'taskGroup';
      return item;
    }
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.command = { command: 'developerinterface.executeTask', title: element.label, arguments: [element] };
    item.iconPath = element.icon ? new vscode.ThemeIcon(element.icon) : undefined;
    item.description = element.description || '';
    item.contextValue = 'task';
    return item;
  }

  getChildren(element) {
    if (!element) {
      return this.configs.map(({ filePath, config }) => ({
        type: 'group',
        label: config.title || path.basename(filePath, '.json'),
        icon: config.icon || 'list',
        filePath,
        tasks: config.tasks || []
      }));
    }
    if (element.type === 'group') {
      return element.tasks.map(t => ({ type: 'task', ...t }));
    }
    return [];
  }

  refresh(configs) {
    if (configs !== undefined) this.configs = configs;
    this._onDidChangeTreeData.fire();
  }
}

// -----------------------------------------------------------------
// Load configuration from a specific file path
// -----------------------------------------------------------------
function loadConfigFromFile(configPath) {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);
    return config;
  } catch (error) {
    vscode.window.showErrorMessage(`Error parsing config: ${error.message}`);
    return null;
  }
}

// -----------------------------------------------------------------
// Get the .developerinterface directory for the current workspace
// -----------------------------------------------------------------
function getConfigDir() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) return null;
  return path.join(workspaceFolders[0].uri.fsPath, '.developerinterface');
}

// -----------------------------------------------------------------
// Load all di-config-*.json config files from .developerinterface/
// -----------------------------------------------------------------
function loadAllConfigs() {
  const configDir = getConfigDir();
  if (!configDir || !fs.existsSync(configDir)) return [];

  try {
    const files = fs.readdirSync(configDir)
      .filter(f => f.startsWith('di-config-') && f.endsWith('.json'))
      .sort();

    return files.flatMap(file => {
      const filePath = path.join(configDir, file);
      const config = loadConfigFromFile(filePath);
      return config ? [{ filePath, config }] : [];
    });
  } catch (error) {
    vscode.window.showErrorMessage(`Error loading configs: ${error.message}`);
    return [];
  }
}

// -----------------------------------------------------------------
// Parse Makefile targets from a given file path
// -----------------------------------------------------------------
function parseMakefileTargets(makefilePath) {
  const content = fs.readFileSync(makefilePath, 'utf8');
  const targets = [];
  for (const line of content.split('\n')) {
    // Match top-level targets: start of line, alphanumeric/dash/underscore, then colon
    // Exclude special targets starting with . and pattern rules containing %
    const match = line.match(/^([a-zA-Z0-9][a-zA-Z0-9_\-]*)\s*:(?!=)/);
    if (match && !match[1].startsWith('.')) {
      targets.push(match[1]);
    }
  }
  return [...new Set(targets)]; // deduplicate
}

// -----------------------------------------------------------------
// Convert a slug to a title case string
// -----------------------------------------------------------------
function slugToTitle(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// -----------------------------------------------------------------
// Prompt the user for a config file suffix and return the 
// normalized suffix, file name, and title
// -----------------------------------------------------------------
async function promptForConfigSuffix(options) {
  const suffix = await vscode.window.showInputBox({
    prompt: `Enter only the file suffix. The file will be created as di-config-<suffix>.json${options.promptSuffix ? ` (${options.promptSuffix})` : ''}`,
    placeHolder: 'xxxxx',
    value: options.defaultValue,
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return 'Enter a file suffix.';
      }
      if (!/^[a-z0-9-]+$/i.test(trimmed)) {
        return 'Use only letters, numbers, and hyphens.';
      }
      return null;
    }
  });

  if (!suffix) {
    return null;
  }

  const normalizedSuffix = suffix.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    suffix: normalizedSuffix,
    fileName: `di-config-${normalizedSuffix}.json`,
    title: slugToTitle(normalizedSuffix)
  };
}

// -----------------------------------------------------------------
// Create a config file from Makefile targets
// -----------------------------------------------------------------
async function createFromMakefile() {
  const configDir = getConfigDir();
  if (!configDir) {
    vscode.window.showWarningMessage('Open a workspace folder before creating a developerinterface template');
    return;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  const makefilePath = path.join(workspaceFolders[0].uri.fsPath, 'Makefile');

  if (!fs.existsSync(makefilePath)) {
    vscode.window.showWarningMessage('No Makefile found in the workspace root');
    return;
  }

  try {
    const targets = parseMakefileTargets(makefilePath);
    if (targets.length === 0) {
      vscode.window.showWarningMessage('No targets found in Makefile');
      return;
    }

    const configIdentity = await promptForConfigSuffix({
      defaultValue: 'makefile-tasks',
      promptSuffix: 'for your Makefile list'
    });
    if (!configIdentity) return;

    const { fileName, title } = configIdentity;
    const configPath = path.join(configDir, fileName);

    if (fs.existsSync(configPath)) {
      const openExisting = 'Open Existing File';
      const overwrite = 'Overwrite';
      const selection = await vscode.window.showInformationMessage(
        `Config file "${fileName}" already exists.`,
        openExisting,
        overwrite
      );
      if (selection === openExisting) {
        const document = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(document);
        return;
      }
      if (selection !== overwrite) return;
    }

    const iconMap = {
      build: 'tools', compile: 'tools', all: 'tools',
      run: 'play', start: 'play', serve: 'play', dev: 'play',
      test: 'testing', check: 'testing', lint: 'testing',
      clean: 'trash', install: 'package', help: 'question', docs: 'book'
    };

    const config = {
      version: '1.0.0',
      title,
      icon: 'file-code',
      tasks: targets.map(target => ({
        label: target,
        description: `make ${target}`,
        command: `make ${target}`,
        icon: iconMap[target.toLowerCase()] || 'terminal'
      }))
    };

    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const document = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(document);
    vscode.window.showInformationMessage(`Created "${fileName}" with ${targets.length} Makefile targets`);
  } catch (error) {
    vscode.window.showErrorMessage(`Error creating config from Makefile: ${error.message}`);
  }
}

// -----------------------------------------------------------------
// Create a new config file 
// -----------------------------------------------------------------
async function createTemplate() {
  const configDir = getConfigDir();
  if (!configDir) {
    vscode.window.showWarningMessage('Open a workspace folder before creating a developerinterface template');
    return;
  }

  const choice = await vscode.window.showQuickPick(
    [
      {
        label: '$(list-ordered) Default Template',
        description: 'Create a new tasks list file with example tasks',
        value: 'default'
      },
      {
        label: '$(file-code) From Makefile',
        description: 'Generate a tasks list file from Makefile targets in the workspace root',
        value: 'makefile'
      }
    ],
    { placeHolder: 'Choose how to create the tasks list' }
  );

  if (!choice) return;

  if (choice.value === 'makefile') {
    await createFromMakefile();
    return;
  }

  const configIdentity = await promptForConfigSuffix({
    defaultValue: 'my-project-tools',
    promptSuffix: 'for your tasks list'
  });
  if (!configIdentity) return;

  const { fileName, title } = configIdentity;
  const configPath = path.join(configDir, fileName);

  if (fs.existsSync(configPath)) {
    const openExisting = 'Open Existing File';
    const selection = await vscode.window.showInformationMessage(
      `Config "${fileName}" already exists.`,
      openExisting
    );
    if (selection === openExisting) {
      const document = await vscode.workspace.openTextDocument(configPath);
      await vscode.window.showTextDocument(document);
    }
    return;
  }

  try {
    const config = {
      version: '1.0.0',
      title,
      icon: 'list',
      tasks: defaultTasks
    };
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    const document = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(document);
    vscode.window.showInformationMessage(`Created "${path.basename(configPath)}"`);
  } catch (error) {
    vscode.window.showErrorMessage(`Error creating template: ${error.message}`);
  }
}

// -----------------------------------------------------------------
// Execute a task in the terminal
// -----------------------------------------------------------------
function executeTask(task) {
  if (!task || !task.command) {
    vscode.window.showErrorMessage('Invalid task configuration');
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: task.label,
    cwd: vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined
  });

  terminal.show();
  terminal.sendText(task.command);
}

// -----------------------------------------------------------------
// Refresh the tree view with all config files and optionally show a message
// -----------------------------------------------------------------
function refreshTree(showMessage) {
  allConfigs = loadAllConfigs();
  if (treeDataProvider) {
    treeDataProvider.refresh(allConfigs);
  }

  if (showMessage) {
    vscode.window.showInformationMessage(showMessage);
  }
}

// -----------------------------------------------------------------
// Activate the extension
// -----------------------------------------------------------------
function activate(context) {
  console.log('DeveloperInterface extension activated');

  allConfigs = loadAllConfigs();

  treeDataProvider = new TaskTreeDataProvider(allConfigs);
  vscode.window.registerTreeDataProvider('developerinterfaceView', treeDataProvider);

  const executeCommand = vscode.commands.registerCommand(
    'developerinterface.executeTask',
    (task) => { executeTask(task); }
  );

  const reloadCommand = vscode.commands.registerCommand(
    'developerinterface.reloadConfig',
    () => { refreshTree('DeveloperInterface configs reloaded'); }
  );

  const createTemplateCommand = vscode.commands.registerCommand(
    'developerinterface.createTemplate',
    async () => {
      await createTemplate();
      refreshTree();
    }
  );

  const createFromMakefileCommand = vscode.commands.registerCommand(
    'developerinterface.createFromMakefile',
    async () => {
      await createFromMakefile();
      refreshTree();
    }
  );

  // -----------------------------------------------------------------
  // Watch .developerinterface/ for any di-config-*.json additions, changes, or deletions
  // -----------------------------------------------------------------
  const configDir = getConfigDir();
  if (configDir) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(configDir, 'di-config-*.json')
    );
    watcher.onDidChange(() => refreshTree('DeveloperInterface config reloaded'));
    watcher.onDidCreate(() => refreshTree('DeveloperInterface config loaded'));
    watcher.onDidDelete(() => refreshTree('DeveloperInterface config removed'));
    context.subscriptions.push(watcher);
  }

  context.subscriptions.push(executeCommand);
  context.subscriptions.push(reloadCommand);
  context.subscriptions.push(createTemplateCommand);
  context.subscriptions.push(createFromMakefileCommand);
}

// -----------------------------------------------------------------
// Deactivate the extension
// -----------------------------------------------------------------
function deactivate() {
  console.log('DeveloperInterface extension deactivated');
}

// -----------------------------------------------------------------
// Export activate and deactivate functions
// -----------------------------------------------------------------
module.exports = {
  activate,
  deactivate
};
