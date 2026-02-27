import type * as vscode from 'vscode';
import type { PluginConfig, JsonSchemaProperty, PluginManifest } from '../../types';
import { WebviewBase, type WebviewMessage } from '../webview-base';
import { ConfigService, McpClientService } from '../../services';
import { createScopedLogger } from '../../utils';

const log = createScopedLogger('PluginConfigPanel');

/**
 * View type identifier for the plugin configuration panel.
 */
const VIEW_TYPE = 'agency.pluginConfig';

/**
 * Message types sent from the webview to the extension.
 */
interface SaveConfigMessage {
  type: 'saveConfig';
  payload: {
    pluginId: string;
    settings: Record<string, unknown>;
  };
}

interface LoadConfigMessage {
  type: 'loadConfig';
  payload: {
    pluginId: string;
  };
}

interface ToggleEnabledMessage {
  type: 'toggleEnabled';
  payload: {
    pluginId: string;
    enabled: boolean;
  };
}

interface ConfigEditedMessage {
  type: 'configEdited';
}

type IncomingMessage = SaveConfigMessage | LoadConfigMessage | ToggleEnabledMessage | ConfigEditedMessage;

/**
 * Message types sent from the extension to the webview.
 */
interface ConfigLoadedMessage {
  type: 'configLoaded';
  payload: {
    plugin: PluginConfig;
    manifest?: PluginManifest;
  };
}

interface ConfigSavedMessage {
  type: 'configSaved';
  payload: {
    success: boolean;
    error?: string;
  };
}

interface ValidationErrorMessage {
  type: 'validationError';
  payload: {
    field: string;
    error: string;
  };
}

type _OutgoingMessage = ConfigLoadedMessage | ConfigSavedMessage | ValidationErrorMessage;

/**
 * Panel instances tracked by plugin ID.
 */
const panels = new Map<string, PluginConfigPanel>();

/**
 * Clear all tracked panels.
 * @internal Used for testing only.
 */
export function _clearPanels(): void {
  for (const panel of panels.values()) {
    panel.dispose();
  }
  panels.clear();
}

/**
 * Webview panel for configuring plugin settings.
 *
 * Features:
 * - Dynamic form generation from plugin settings schema
 * - Real-time validation as user types
 * - Save/cancel functionality
 * - Enable/disable toggle
 * - Theme-aware styling using VS Code CSS variables
 *
 * @example
 * ```typescript
 * const panel = PluginConfigPanel.createOrShow(vscode, extensionUri, pluginConfig);
 * ```
 */
export class PluginConfigPanel extends WebviewBase {
  private _plugin: PluginConfig;
  private _manifest?: PluginManifest;
  private _metadataSource: 'mcp' | 'manifest' | 'none' = 'none';
  private readonly _configService: ConfigService;

  private constructor(
    vscodeModule: typeof vscode,
    extensionUri: vscode.Uri,
    plugin: PluginConfig,
    manifest?: PluginManifest
  ) {
    super(vscodeModule, extensionUri, {
      viewType: VIEW_TYPE,
      title: `Configure: ${plugin.id}`,
      column: vscodeModule.ViewColumn.One,
      enableScripts: true,
      retainContextWhenHidden: true,
    });

    this._plugin = plugin;
    this._manifest = manifest;
    this._configService = ConfigService.getInstance();

    // Subscribe to config changes to update the panel
    this._disposables.add(
      this._configService.onConfigChange(() => {
        const updatedPlugin = this._configService.getPlugin(this._plugin.id);
        if (updatedPlugin) {
          this._plugin = updatedPlugin;
          this.refresh();
        }
      })
    );

    // Subscribe to config conflicts
    this._disposables.add(
      this._configService.onConfigConflict(() => {
        this._handleConflict();
      })
    );
  }

  /**
   * Create or show a plugin configuration panel.
   * If a panel for this plugin already exists, reveal it.
   *
   * Queries the MCP server for plugin metadata on open. If the server
   * provides a settings schema for this plugin, the panel renders typed
   * form controls. Otherwise it falls back to a JSON editor.
   *
   * @param vscodeModule The VS Code module
   * @param extensionUri The extension's URI
   * @param plugin The plugin configuration to edit
   * @param manifest Optional plugin manifest with schema information
   * @returns The panel instance
   */
  static createOrShow(
    vscodeModule: typeof vscode,
    extensionUri: vscode.Uri,
    plugin: PluginConfig,
    manifest?: PluginManifest
  ): PluginConfigPanel {
    // Check for existing panel
    const existingPanel = panels.get(plugin.id);
    if (existingPanel) {
      existingPanel._plugin = plugin;
      existingPanel._manifest = manifest;
      existingPanel.show();
      existingPanel._fetchAndApplyMetadata();
      return existingPanel;
    }

    // Create new panel
    const panel = new PluginConfigPanel(vscodeModule, extensionUri, plugin, manifest);
    panels.set(plugin.id, panel);
    panel.show();
    panel._fetchAndApplyMetadata();

    log.info(`Created config panel for plugin: ${plugin.id}`);
    return panel;
  }

  /**
   * Query the MCP server for plugin metadata and update the panel
   * if a settings schema is discovered for this plugin.
   */
  private async _fetchAndApplyMetadata(): Promise<void> {
    try {
      const mcpService = McpClientService.getInstance();
      const allMetadata = await mcpService.getPluginMetadata();
      const metadata = allMetadata.find((m) => m.id === this._plugin.id);

      if (metadata?.settingsSchema) {
        // Merge MCP metadata into manifest, preferring server-provided schema
        this._manifest = {
          id: metadata.id,
          name: metadata.name,
          description: metadata.description,
          version: metadata.version,
          tools: this._manifest?.tools ?? [],
          ...this._manifest,
          settingsSchema: metadata.settingsSchema,
        };
        this._metadataSource = 'mcp';
        log.info(`Applied MCP metadata schema for plugin: ${this._plugin.id}`);
      } else if (this._manifest?.settingsSchema) {
        this._metadataSource = 'manifest';
      } else {
        this._metadataSource = 'none';
      }
    } catch (error) {
      log.warn(`Failed to fetch plugin metadata for ${this._plugin.id}:`, error);
      this._metadataSource = this._manifest?.settingsSchema ? 'manifest' : 'none';
    }

    this.refresh();
  }

  /**
   * Dispose of the panel and remove from tracking.
   */
  override dispose(): void {
    panels.delete(this._plugin.id);
    super.dispose();
  }

  /**
   * Handle when panel is disposed (e.g., user closes it).
   */
  protected override onDispose(): void {
    panels.delete(this._plugin.id);
  }

  /**
   * Handle messages from the webview.
   */
  protected handleMessage(message: WebviewMessage): void {
    // Validate message structure
    if (!message || typeof message.type !== 'string') {
      log.debug(`Ignoring invalid message: ${JSON.stringify(message)}`);
      return;
    }

    // Ignore VS Code internal messages
    if (message.type.includes('object') || message.type.startsWith('vscode')) {
      return;
    }

    const msg = message as IncomingMessage;

    switch (msg.type) {
      case 'saveConfig':
        this._handleSaveConfig(msg.payload);
        break;

      case 'loadConfig':
        this._handleLoadConfig(msg.payload);
        break;

      case 'toggleEnabled':
        this._handleToggleEnabled(msg.payload);
        break;

      case 'configEdited':
        this._configService.setWebviewDirty(true);
        break;

      default:
        log.debug(`Ignoring unknown message type: ${(msg as { type: string }).type}`);
    }
  }

  /**
   * Handle save configuration request.
   */
  private async _handleSaveConfig(payload: SaveConfigMessage['payload']): Promise<void> {
    try {
      // Validate settings is a proper object (guards against JSON editor misuse)
      if (typeof payload.settings !== 'object' || payload.settings === null || Array.isArray(payload.settings)) {
        await this.postMessage({
          type: 'configSaved',
          payload: { success: false, error: 'Settings must be a JSON object' },
        } as ConfigSavedMessage);
        return;
      }

      // Validate settings if schema is available
      if (this._manifest?.settingsSchema) {
        const errors = this._validateSettings(payload.settings, this._manifest.settingsSchema.properties);
        if (errors.length > 0) {
          for (const error of errors) {
            await this.postMessage({
              type: 'validationError',
              payload: error,
            } as ValidationErrorMessage);
          }
          return;
        }
      }

      // Save the configuration
      await this._configService.savePluginConfig({
        ...this._plugin,
        settings: payload.settings,
      });

      // Notify webview of success
      await this.postMessage({
        type: 'configSaved',
        payload: { success: true },
      } as ConfigSavedMessage);

      log.info(`Saved config for plugin: ${payload.pluginId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.postMessage({
        type: 'configSaved',
        payload: { success: false, error: errorMessage },
      } as ConfigSavedMessage);

      log.error(`Failed to save config for plugin: ${payload.pluginId}`, error);
    }
  }

  /**
   * Handle load configuration request.
   */
  private async _handleLoadConfig(payload: LoadConfigMessage['payload']): Promise<void> {
    const plugin = this._configService.getPlugin(payload.pluginId);
    if (plugin) {
      this._plugin = plugin;
      await this.postMessage({
        type: 'configLoaded',
        payload: {
          plugin,
          manifest: this._manifest,
        },
      } as ConfigLoadedMessage);
    }
  }

  /**
   * Handle enable/disable toggle.
   */
  private async _handleToggleEnabled(payload: ToggleEnabledMessage['payload']): Promise<void> {
    try {
      await this._configService.savePluginConfig({
        ...this._plugin,
        enabled: payload.enabled,
      });

      log.info(`Toggled plugin ${payload.pluginId} enabled: ${payload.enabled}`);
    } catch (error) {
      log.error(`Failed to toggle plugin enabled state: ${payload.pluginId}`, error);
    }
  }

  /**
   * Handle config conflict by showing a notification to the user.
   */
  private async _handleConflict(): Promise<void> {
    const choice = await this._vscodeModule.window.showWarningMessage(
      'Config file changed externally. Reload and lose your changes, or keep editing?',
      'Reload',
      'Keep'
    );

    if (choice === 'Reload') {
      const updatedPlugin = this._configService.getPlugin(this._plugin.id);
      if (updatedPlugin) {
        this._plugin = updatedPlugin;
      }
      this._configService.setWebviewDirty(false);
      this.refresh();
      log.info('Reloaded config after external conflict');
    } else {
      log.info('User chose to keep editing despite external config change');
    }
  }

  /**
   * Validate settings against schema.
   */
  private _validateSettings(
    settings: Record<string, unknown>,
    schema?: Record<string, JsonSchemaProperty>
  ): Array<{ field: string; error: string }> {
    const errors: Array<{ field: string; error: string }> = [];

    if (!schema) {
      return errors;
    }

    for (const [key, propSchema] of Object.entries(schema)) {
      const value = settings[key];

      // Check type
      if (value !== undefined && value !== null) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== propSchema.type) {
          errors.push({
            field: key,
            error: `Expected ${propSchema.type}, got ${actualType}`,
          });
          continue;
        }

        // String validations
        if (propSchema.type === 'string' && typeof value === 'string') {
          if (propSchema.minLength !== undefined && value.length < propSchema.minLength) {
            errors.push({
              field: key,
              error: `Minimum length is ${propSchema.minLength}`,
            });
          }
          if (propSchema.maxLength !== undefined && value.length > propSchema.maxLength) {
            errors.push({
              field: key,
              error: `Maximum length is ${propSchema.maxLength}`,
            });
          }
          if (propSchema.pattern !== undefined) {
            const regex = new RegExp(propSchema.pattern);
            if (!regex.test(value)) {
              errors.push({
                field: key,
                error: `Value does not match pattern: ${propSchema.pattern}`,
              });
            }
          }
        }

        // Number validations
        if (propSchema.type === 'number' && typeof value === 'number') {
          if (propSchema.minimum !== undefined && value < propSchema.minimum) {
            errors.push({
              field: key,
              error: `Minimum value is ${propSchema.minimum}`,
            });
          }
          if (propSchema.maximum !== undefined && value > propSchema.maximum) {
            errors.push({
              field: key,
              error: `Maximum value is ${propSchema.maximum}`,
            });
          }
        }

        // Enum validation
        if (propSchema.enum !== undefined && !propSchema.enum.includes(value)) {
          errors.push({
            field: key,
            error: `Value must be one of: ${propSchema.enum.join(', ')}`,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Determine whether to use schema-driven form, settings-inferred form, or JSON editor.
   */
  private _getFormMode(
    schema?: Record<string, JsonSchemaProperty>,
    settings?: Record<string, unknown>
  ): 'schema' | 'settings' | 'json-editor' {
    if (schema && Object.keys(schema).length > 0) {
      return 'schema';
    }

    // If we have a manifest (from MCP or passed in) but no schema properties,
    // and settings exist, show inferred form fields
    if (settings && Object.keys(settings).length > 0) {
      return 'settings';
    }

    // No schema and no settings — use JSON editor for free-form editing
    if (this._metadataSource === 'none') {
      return 'json-editor';
    }

    return 'settings';
  }

  /**
   * Generate the HTML content for the webview.
   */
  protected getHtmlContent(webview: vscode.Webview): string {
    const plugin = this._plugin;
    const manifest = this._manifest;
    const schema = manifest?.settingsSchema?.properties;
    const formMode = this._getFormMode(schema, plugin.settings);

    // Generate form fields from settings or schema
    const formFields = formMode === 'json-editor'
      ? this._generateJsonEditor(plugin.settings)
      : this._generateFormFields(plugin.settings, schema);

    const body = `
      <div class="container">
        <header class="card-header">
          <h1 class="card-title">${manifest?.name ?? plugin.id}</h1>
          <div class="flex align-center gap-sm">
            <label class="toggle-label">
              <input type="checkbox" id="enabledToggle" ${plugin.enabled ? 'checked' : ''}>
              <span>${plugin.enabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          </div>
        </header>

        ${manifest?.description ? `<p class="text-muted">${manifest.description}</p>` : ''}
        ${manifest?.version ? `<p class="text-small text-muted">Version: ${manifest.version}</p>` : ''}

        <form id="configForm" class="mt-md" data-mode="${formMode}">
          ${formFields}

          <div class="form-actions flex gap-sm mt-md">
            <button type="submit" id="saveBtn">Save</button>
            <button type="button" id="resetBtn" class="secondary">Reset</button>
          </div>
        </form>

        <div id="statusMessage" class="message hidden"></div>
      </div>
    `;

    const scripts = `
      // Current plugin state
      let currentPlugin = ${JSON.stringify(plugin)};
      let originalSettings = JSON.parse(JSON.stringify(currentPlugin.settings));

      // DOM elements
      const form = document.getElementById('configForm');
      const enabledToggle = document.getElementById('enabledToggle');
      const saveBtn = document.getElementById('saveBtn');
      const resetBtn = document.getElementById('resetBtn');
      const statusMessage = document.getElementById('statusMessage');

      // Handle form submission
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveConfig();
      });

      // Handle enabled toggle
      enabledToggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        e.target.nextElementSibling.textContent = enabled ? 'Enabled' : 'Disabled';
        postMessage('toggleEnabled', {
          pluginId: currentPlugin.id,
          enabled
        });
      });

      // Handle reset button
      resetBtn.addEventListener('click', () => {
        resetForm();
      });

      // Collect form data and save
      function saveConfig() {
        const settings = collectFormData();

        // JSON editor mode: handle parse errors
        if (settings === null) {
          showStatus('error', 'Invalid JSON: please check your syntax');
          return;
        }

        // Client-side validation
        const errors = validateForm(settings);
        if (errors.length > 0) {
          showStatus('error', errors.map(e => e.error).join('\\n'));
          return;
        }

        postMessage('saveConfig', {
          pluginId: currentPlugin.id,
          settings
        });

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      // Collect form data into settings object
      function collectFormData() {
        // JSON editor mode: parse the entire textarea as settings
        const jsonEditor = document.getElementById('jsonEditor');
        if (jsonEditor) {
          try {
            return JSON.parse(jsonEditor.value);
          } catch {
            return null; // Signal parse error
          }
        }

        const settings = {};
        const inputs = form.querySelectorAll('input, select, textarea');

        for (const input of inputs) {
          if (input.id === 'enabledToggle') continue;

          const key = input.name || input.id;
          if (!key) continue;

          let value;
          if (input.type === 'checkbox') {
            value = input.checked;
          } else if (input.type === 'number') {
            value = input.value === '' ? undefined : Number(input.value);
          } else if (input.dataset.type === 'json') {
            try {
              value = JSON.parse(input.value);
            } catch {
              value = input.value;
            }
          } else {
            value = input.value;
          }

          if (value !== undefined && value !== '') {
            settings[key] = value;
          }
        }

        return settings;
      }

      // Client-side validation
      function validateForm(settings) {
        const errors = [];
        const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');

        for (const input of inputs) {
          const key = input.name || input.id;
          if (!settings[key] && settings[key] !== 0 && settings[key] !== false) {
            errors.push({ field: key, error: key + ' is required' });
            input.classList.add('input-error');
          } else {
            input.classList.remove('input-error');
          }
        }

        return errors;
      }

      // Reset form to original values
      function resetForm() {
        // JSON editor mode: reset the textarea
        const jsonEditor = document.getElementById('jsonEditor');
        if (jsonEditor) {
          jsonEditor.value = JSON.stringify(originalSettings, null, 2);
          clearErrors();
          showStatus('info', 'Form reset to original values');
          return;
        }

        for (const [key, value] of Object.entries(originalSettings)) {
          const input = form.querySelector('[name="' + key + '"], #' + key);
          if (!input) continue;

          if (input.type === 'checkbox') {
            input.checked = Boolean(value);
          } else if (typeof value === 'object') {
            input.value = JSON.stringify(value, null, 2);
          } else {
            input.value = value;
          }
        }

        clearErrors();
        showStatus('info', 'Form reset to original values');
      }

      // Clear validation errors
      function clearErrors() {
        const errorInputs = form.querySelectorAll('.input-error');
        for (const input of errorInputs) {
          input.classList.remove('input-error');
        }
        const errorMessages = form.querySelectorAll('.error-message');
        for (const msg of errorMessages) {
          msg.remove();
        }
      }

      // Show status message
      function showStatus(type, message) {
        statusMessage.className = 'message message-' + type;
        statusMessage.textContent = message;
        statusMessage.classList.remove('hidden');

        // Auto-hide success messages
        if (type === 'info') {
          setTimeout(() => {
            statusMessage.classList.add('hidden');
          }, 3000);
        }
      }

      // Handle messages from extension
      window.addEventListener('message', (event) => {
        const message = event.data;

        switch (message.type) {
          case 'configLoaded':
            currentPlugin = message.payload.plugin;
            originalSettings = JSON.parse(JSON.stringify(currentPlugin.settings));
            updateFormFromConfig();
            break;

          case 'configSaved':
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
            if (message.payload.success) {
              originalSettings = JSON.parse(JSON.stringify(collectFormData()));
              showStatus('info', 'Configuration saved successfully');
            } else {
              showStatus('error', 'Failed to save: ' + (message.payload.error || 'Unknown error'));
            }
            break;

          case 'validationError':
            const input = form.querySelector('[name="' + message.payload.field + '"], #' + message.payload.field);
            if (input) {
              input.classList.add('input-error');
              const errorEl = document.createElement('span');
              errorEl.className = 'error-message';
              errorEl.textContent = message.payload.error;
              input.parentElement.appendChild(errorEl);
            }
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
            break;
        }
      });

      // Update form from loaded config
      function updateFormFromConfig() {
        // JSON editor mode: update the textarea
        const jsonEditor = document.getElementById('jsonEditor');
        if (jsonEditor) {
          jsonEditor.value = JSON.stringify(currentPlugin.settings, null, 2);
        } else {
          for (const [key, value] of Object.entries(currentPlugin.settings)) {
            const input = form.querySelector('[name="' + key + '"], #' + key);
            if (!input) continue;

            if (input.type === 'checkbox') {
              input.checked = Boolean(value);
            } else if (typeof value === 'object') {
              input.value = JSON.stringify(value, null, 2);
            } else {
              input.value = value;
            }
          }
        }

        enabledToggle.checked = currentPlugin.enabled;
        enabledToggle.nextElementSibling.textContent = currentPlugin.enabled ? 'Enabled' : 'Disabled';
      }

      // Input change handler for real-time validation and dirty tracking
      form.addEventListener('input', (e) => {
        const input = e.target;
        input.classList.remove('input-error');
        const errorMsg = input.parentElement.querySelector('.error-message');
        if (errorMsg) errorMsg.remove();

        // Notify extension that webview has unsaved edits
        postMessage('configEdited');
      });

      // Request initial config load
      postMessage('loadConfig', { pluginId: currentPlugin.id });
    `;

    const styles = `
      <style>
        .toggle-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .form-actions {
          padding-top: 16px;
          border-top: 1px solid var(--vscode-panel-border);
        }

        .input-error {
          border-color: var(--vscode-inputValidation-errorBorder) !important;
          background-color: var(--vscode-inputValidation-errorBackground) !important;
        }

        .error-message {
          display: block;
          color: var(--vscode-errorForeground);
          font-size: 0.85em;
          margin-top: 4px;
        }

        .field-description {
          font-size: 0.85em;
          color: var(--vscode-descriptionForeground);
          margin-top: 2px;
        }

        textarea {
          min-height: 80px;
          resize: vertical;
        }

        .form-group select {
          appearance: auto;
        }

        .json-editor-container .json-editor-hint {
          margin-bottom: 8px;
        }

        .json-editor {
          font-family: var(--vscode-editor-font-family, monospace);
          font-size: var(--vscode-editor-font-size, 13px);
          min-height: 200px;
          resize: vertical;
          tab-size: 2;
        }
      </style>
    `;

    return this.getBaseHtml(webview, {
      title: `Configure: ${plugin.id}`,
      body,
      scripts,
      styles,
    });
  }

  /**
   * Generate form fields from settings and schema.
   */
  private _generateFormFields(
    settings: Record<string, unknown>,
    schema?: Record<string, JsonSchemaProperty>
  ): string {
    if (schema && Object.keys(schema).length > 0) {
      return this._generateFieldsFromSchema(settings, schema);
    }

    // Fall back to generating fields from existing settings
    return this._generateFieldsFromSettings(settings);
  }

  /**
   * Generate form fields from JSON schema.
   */
  private _generateFieldsFromSchema(
    settings: Record<string, unknown>,
    schema: Record<string, JsonSchemaProperty>
  ): string {
    const fields: string[] = [];

    for (const [key, propSchema] of Object.entries(schema)) {
      const value = settings[key] ?? propSchema.default;
      const field = this._generateFieldFromSchema(key, value, propSchema);
      fields.push(field);
    }

    return fields.join('');
  }

  /**
   * Generate a single form field from schema property.
   */
  private _generateFieldFromSchema(
    key: string,
    value: unknown,
    schema: JsonSchemaProperty
  ): string {
    const description = schema.description
      ? `<span class="field-description">${schema.description}</span>`
      : '';

    let input: string;

    // Handle enum as select
    if (schema.enum && schema.enum.length > 0) {
      const options = schema.enum
        .map((opt) => {
          const selected = opt === value ? 'selected' : '';
          return `<option value="${opt}" ${selected}>${opt}</option>`;
        })
        .join('');
      input = `<select name="${key}" id="${key}">${options}</select>`;
    }
    // Handle boolean as checkbox
    else if (schema.type === 'boolean') {
      const checked = value === true ? 'checked' : '';
      input = `<label class="toggle-label">
        <input type="checkbox" name="${key}" id="${key}" ${checked}>
        <span>${key}</span>
      </label>`;
      return `<div class="form-group">${input}${description}</div>`;
    }
    // Handle number
    else if (schema.type === 'number') {
      const attrs: string[] = [];
      if (schema.minimum !== undefined) attrs.push(`min="${schema.minimum}"`);
      if (schema.maximum !== undefined) attrs.push(`max="${schema.maximum}"`);
      input = `<input type="number" name="${key}" id="${key}" value="${value ?? ''}" ${attrs.join(' ')}>`;
    }
    // Handle array or object as JSON textarea
    else if (schema.type === 'array' || schema.type === 'object') {
      const jsonValue = value !== undefined ? JSON.stringify(value, null, 2) : '';
      input = `<textarea name="${key}" id="${key}" data-type="json">${jsonValue}</textarea>`;
    }
    // Handle string (default)
    else {
      const attrs: string[] = [];
      if (schema.minLength !== undefined) attrs.push(`minlength="${schema.minLength}"`);
      if (schema.maxLength !== undefined) attrs.push(`maxlength="${schema.maxLength}"`);
      if (schema.pattern !== undefined) attrs.push(`pattern="${schema.pattern}"`);
      const strValue = value !== undefined ? String(value) : '';
      input = `<input type="text" name="${key}" id="${key}" value="${this._escapeHtml(strValue)}" ${attrs.join(' ')}>`;
    }

    return `
      <div class="form-group">
        <label for="${key}">${key}</label>
        ${input}
        ${description}
      </div>
    `;
  }

  /**
   * Generate a JSON editor textarea for free-form settings editing.
   * Used when no schema is available (e.g., MCP server disconnected).
   */
  private _generateJsonEditor(settings: Record<string, unknown>): string {
    const jsonValue = JSON.stringify(settings, null, 2);
    return `
      <div class="json-editor-container">
        <p class="text-muted json-editor-hint">
          No settings schema available. Edit settings as JSON.
        </p>
        <div class="form-group">
          <label for="jsonEditor">Settings (JSON)</label>
          <textarea id="jsonEditor" class="json-editor" data-type="json">${this._escapeHtml(jsonValue)}</textarea>
        </div>
      </div>
    `;
  }

  /**
   * Generate form fields from existing settings (no schema).
   */
  private _generateFieldsFromSettings(settings: Record<string, unknown>): string {
    if (Object.keys(settings).length === 0) {
      return `
        <div class="empty-state">
          <p class="empty-state-title">No Settings</p>
          <p class="empty-state-description">This plugin has no configurable settings.</p>
        </div>
      `;
    }

    const fields: string[] = [];

    for (const [key, value] of Object.entries(settings)) {
      const field = this._generateFieldFromValue(key, value);
      fields.push(field);
    }

    return fields.join('');
  }

  /**
   * Generate a form field from a setting value (inferring type).
   */
  private _generateFieldFromValue(key: string, value: unknown): string {
    let input: string;

    if (typeof value === 'boolean') {
      const checked = value ? 'checked' : '';
      input = `<label class="toggle-label">
        <input type="checkbox" name="${key}" id="${key}" ${checked}>
        <span>${key}</span>
      </label>`;
      return `<div class="form-group">${input}</div>`;
    }

    if (typeof value === 'number') {
      input = `<input type="number" name="${key}" id="${key}" value="${value}">`;
    } else if (typeof value === 'object' && value !== null) {
      const jsonValue = JSON.stringify(value, null, 2);
      input = `<textarea name="${key}" id="${key}" data-type="json">${jsonValue}</textarea>`;
    } else {
      const strValue = value !== null && value !== undefined ? String(value) : '';
      input = `<input type="text" name="${key}" id="${key}" value="${this._escapeHtml(strValue)}">`;
    }

    return `
      <div class="form-group">
        <label for="${key}">${key}</label>
        ${input}
      </div>
    `;
  }

  /**
   * Escape HTML special characters.
   */
  private _escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
