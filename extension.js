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
let extensionContext = null;

const TEMPLATE_FILE_PATTERN = /^di-template-.*\.json$/i;

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
// Built-in fallback template if templates folder is missing/invalid
// -----------------------------------------------------------------
const fallbackTemplates = [
  {
    id: 'default',
    displayName: 'Default Template',
    description: 'Create a new tasks list file with example tasks',
    defaultSuffix: 'my-project-tools',
    config: {
      version: '1.0.0',
      icon: 'list',
      tasks: defaultTasks
    }
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
// Get extension templates folder path
// -----------------------------------------------------------------
function getTemplatesDir(context) {
  return path.join(context.extensionPath, 'templates');
}

// -----------------------------------------------------------------
// Validate and normalize a template object loaded from disk
// -----------------------------------------------------------------
function normalizeTemplate(rawTemplate, fileName) {
  if (!rawTemplate || typeof rawTemplate !== 'object') return null;
  const baseName = path.basename(fileName, '.json');
  const id = (rawTemplate.id || baseName.replace(/^di-template-/, '')).toString().trim();
  // Support both template shapes:
  // 1) Wrapped: { displayName, defaultSuffix, config: { version, icon, tasks } }
  // 2) Legacy : { title, version, icon, tasks }
  const templateConfig = (rawTemplate.config && typeof rawTemplate.config === 'object')
    ? rawTemplate.config
    : rawTemplate;
  const tasks = Array.isArray(templateConfig.tasks) ? templateConfig.tasks : [];

  const normalizedTasks = tasks
    .filter(task => {
      if (!task || typeof task.label !== 'string') return false;
      if (typeof task.command === 'string' && task.command.trim().length > 0) return true;
      return typeof task.action === 'string' && task.action.trim().length > 0;
    })
    .map(task => ({
      label: task.label,
      description: typeof task.description === 'string' ? task.description : '',
      command: typeof task.command === 'string' ? task.command : '',
      action: typeof task.action === 'string' ? task.action : undefined,
      projectTemplateFolder: typeof task.projectTemplateFolder === 'string' ? task.projectTemplateFolder : undefined,
      icon: typeof task.icon === 'string' ? task.icon : 'terminal'
    }));

  return {
    id,
    displayName: (rawTemplate.displayName || rawTemplate.title || slugToTitle(id)).toString(),
    description: (rawTemplate.description || 'Create a new tasks list file from this template').toString(),
    defaultSuffix: (rawTemplate.defaultSuffix || `${id}-tools`).toString(),
    config: {
      version: typeof templateConfig.version === 'string' ? templateConfig.version : '1.0.0',
      icon: typeof templateConfig.icon === 'string' ? templateConfig.icon : 'list',
      tasks: normalizedTasks
    }
  };
}

// -----------------------------------------------------------------
// Copy one file or folder recursively
// -----------------------------------------------------------------
function copyEntryRecursive(sourcePath, targetPath, overwrite) {
  const fileName = path.basename(sourcePath);
  const skipFilePatterns = [
    /\.ko$/,
    /\.o$/,
    /\.mod$/,
    /\.mod\.c$/,
    /^Module\.symvers$/,
    /^modules\.order$/,
    /^\..*\.cmd$/,
    /^\.module-common\.o$/,
    /^\.tmp_versions$/
  ];

  if (skipFilePatterns.some(pattern => pattern.test(fileName))) {
    return;
  }

  const sourceStat = fs.statSync(sourcePath);
  if (sourceStat.isDirectory()) {
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
    const children = fs.readdirSync(sourcePath);
    for (const child of children) {
      copyEntryRecursive(path.join(sourcePath, child), path.join(targetPath, child), overwrite);
    }
    return;
  }

  if (fs.existsSync(targetPath) && !overwrite) {
    return;
  }
  fs.copyFileSync(sourcePath, targetPath);
}

// -----------------------------------------------------------------
// Execute init project action by copying template files into workspace
// -----------------------------------------------------------------
async function executeInitProjectTask(task) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage('Open a workspace folder before initializing a project template');
    return;
  }

  if (!extensionContext) {
    vscode.window.showErrorMessage('Extension context is not available');
    return;
  }

  const projectTemplateFolder = task.projectTemplateFolder;
  if (!projectTemplateFolder) {
    vscode.window.showErrorMessage('Invalid init task: missing projectTemplateFolder');
    return;
  }

  const sourceDir = path.join(extensionContext.extensionPath, 'templates', 'projects', projectTemplateFolder);
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    vscode.window.showErrorMessage(`Project template folder not found: ${projectTemplateFolder}`);
    return;
  }

  const destinationDir = workspaceFolders[0].uri.fsPath;
  const confirm = await vscode.window.showWarningMessage(
    `Do you really want to initialize this project in "${destinationDir}"?`,
    { modal: true },
    'Yes'
  );

  if (confirm !== 'Yes') {
    return;
  }

  const conflicts = fs.readdirSync(sourceDir)
    .filter(entry => fs.existsSync(path.join(destinationDir, entry)));

  let overwrite = false;
  if (conflicts.length > 0) {
    const overwriteConfirm = await vscode.window.showWarningMessage(
      `Some files already exist (${conflicts.slice(0, 5).join(', ')}${conflicts.length > 5 ? ', ...' : ''}). Overwrite them?`,
      { modal: true },
      'Overwrite',
      'Cancel'
    );
    if (overwriteConfirm !== 'Overwrite') {
      return;
    }
    overwrite = true;
  }

  try {
    const entries = fs.readdirSync(sourceDir);
    for (const entry of entries) {
      copyEntryRecursive(path.join(sourceDir, entry), path.join(destinationDir, entry), overwrite);
    }
    vscode.window.showInformationMessage(`Project initialized from template "${projectTemplateFolder}"`);
    refreshTree();
  } catch (error) {
    vscode.window.showErrorMessage(`Error initializing project template: ${error.message}`);
  }
}

// -----------------------------------------------------------------
// Load templates from templates/di-template-*.json in the extension
// -----------------------------------------------------------------
function loadTemplates(context) {
  const templatesDir = getTemplatesDir(context);
  if (!fs.existsSync(templatesDir)) {
    return fallbackTemplates;
  }

  try {
    const files = fs.readdirSync(templatesDir)
      .filter(fileName => TEMPLATE_FILE_PATTERN.test(fileName))
      .sort();

    const templates = files.flatMap(fileName => {
      const templatePath = path.join(templatesDir, fileName);
      try {
        const content = fs.readFileSync(templatePath, 'utf8');
        const parsed = JSON.parse(content);
        const normalized = normalizeTemplate(parsed, fileName);
        return normalized ? [normalized] : [];
      } catch (error) {
        vscode.window.showWarningMessage(`Invalid template "${fileName}": ${error.message}`);
        return [];
      }
    });

    return templates.length > 0 ? templates : fallbackTemplates;
  } catch (error) {
    vscode.window.showWarningMessage(`Error loading templates: ${error.message}`);
    return fallbackTemplates;
  }
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
async function createTemplate(context) {
  const configDir = getConfigDir();
  if (!configDir) {
    vscode.window.showWarningMessage('Open a workspace folder before creating a developerinterface template');
    return;
  }

  const templates = loadTemplates(context);

  const templateChoices = templates.map(template => ({
    label: `$(list-ordered) ${template.displayName}`,
    description: template.description,
    value: `template:${template.id}`,
    template
  }));

  const choice = await vscode.window.showQuickPick(
    [
      ...templateChoices,
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

  const selectedTemplate = choice.template;
  if (!selectedTemplate) {
    vscode.window.showWarningMessage('No template selected');
    return;
  }

  const configIdentity = await promptForConfigSuffix({
    defaultValue: selectedTemplate.defaultSuffix,
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
      version: selectedTemplate.config.version || '1.0.0',
      title,
      icon: selectedTemplate.config.icon || 'list',
      tasks: selectedTemplate.config.tasks || []
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
async function executeTask(task) {
  if (!task) {
    vscode.window.showErrorMessage('Invalid task configuration');
    return;
  }

  if (task.action === 'initProjectTemplate') {
    await executeInitProjectTask(task);
    return;
  }

  if (!task.command) {
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
  extensionContext = context;

  allConfigs = loadAllConfigs();

  treeDataProvider = new TaskTreeDataProvider(allConfigs);
  vscode.window.registerTreeDataProvider('developerinterfaceView', treeDataProvider);

  const executeCommand = vscode.commands.registerCommand(
    'developerinterface.executeTask',
    async (task) => { await executeTask(task); }
  );

  const reloadCommand = vscode.commands.registerCommand(
    'developerinterface.reloadConfig',
    () => { refreshTree('DeveloperInterface configs reloaded'); }
  );

  const createTemplateCommand = vscode.commands.registerCommand(
    'developerinterface.createTemplate',
    async () => {
      await createTemplate(context);
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
