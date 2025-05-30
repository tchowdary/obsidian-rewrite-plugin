import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';

// Crypto utilities for encryption/decryption
import * as CryptoJS from 'crypto-js';

interface RewritePluginSettings {
	apiUrl: string;
	apiKey: string;
	encryptionKey: string;
	model: string;
}

const DEFAULT_SETTINGS: RewritePluginSettings = {
	apiUrl: '',
	apiKey: '',
	encryptionKey: '',
	model: 'Sonnet-3.7'
}

export default class RewritePlugin extends Plugin {
	settings: RewritePluginSettings;

	async onload() {
		await this.loadSettings();



		// This adds a command that can be triggered when text is selected
		this.addCommand({
			id: 'rewrite-selected-text',
			name: 'Rewrite',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selectedText = editor.getSelection();
				if (selectedText) {
					this.callRewriteApi(selectedText, editor);
				} else {
					new Notice('No text selected');
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new RewriteSettingTab(this.app, this));


	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Encryption and decryption methods
	encryptPayload(payload: any): { encrypted: string } {
		if (!this.settings.encryptionKey) {
			new Notice('Encryption key not set');
			return { encrypted: '' };
		}
		
		// Convert payload to JSON string
		const payloadString = JSON.stringify(payload);
		
		// Encrypt using CryptoJS with exact format matching
		const encrypted = CryptoJS.AES.encrypt(payloadString, this.settings.encryptionKey).toString();
		
		// Return the encrypted payload in exact format: {"encrypted":"..."}
		return { encrypted };
	}

	decryptResponse(encryptedResponse: { encrypted: string }): any {
		// If response is not encrypted or no key provided, return as is
		if (!encryptedResponse.encrypted || !this.settings.encryptionKey) {
			return encryptedResponse;
		}
		
		try {
			// Decrypt the response
			const bytes = CryptoJS.AES.decrypt(encryptedResponse.encrypted, this.settings.encryptionKey);
			const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
			
			// Parse the JSON string back to an object
			return JSON.parse(decryptedString);
		} catch (error) {
			new Notice('Failed to decrypt response: Invalid encryption key or corrupted data');
			return null;
		}
	}

	// API call method
	async callRewriteApi(text: string, editor: Editor): Promise<void> {
		if (!this.settings.apiUrl) {
			new Notice('API URL not configured');
			return;
		}

		if (!this.settings.apiKey) {
			new Notice('API Key not configured');
			return;
		}

		if (!this.settings.encryptionKey) {
			new Notice('Encryption key not configured');
			return;
		}

		try {
			new Notice('Calling API...');
			
			// Create messages with the selected text
			const messages = [
				{
					role: 'user',
					content: `Your task is to take the text provided and improve it while preserving all formatting, including links, bullet points, and other markup. Rewrite it into a clear, grammatically correct version while preserving the original meaning as closely as possible. Correct any spelling mistakes, punctuation errors, verb tense issues, word choice problems, and other grammatical mistakes. Maintain the original structure and only improve the content and return the result as valid markdown.

Here is the text to improve:
${text}
Return only the edited text. Do not wrap your response in quotes. Do not offer anything else other than the edited text in the response.`
				}
			];

			// Create the payload
			const payload = {
				model: this.settings.model,
				messages: messages,
				customInstruction: {
					content: `You are an expert editor who improves text while preserving formatting. 
				Focus only on improving grammar, spelling, clarity, and readability.
				Return only the improved text with no additional commentary.
				Return only the edited text. Do not wrap your response in quotes. Do not offer anything else other than the edited text in the response.`
				}
			};

			// Encrypt the payload
			const encryptedPayload = this.encryptPayload(payload);
			
			// // Log request details for debugging

			
			// Prepare request options - ensure the encrypted payload is sent directly
			const requestOptions = {
				url: this.settings.apiUrl,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': this.settings.apiKey
				},
				// Send the encrypted payload directly without any additional wrapping
				body: JSON.stringify(encryptedPayload)
			};
			
			// Make API request
			const response = await requestUrl(requestOptions);

			// Log response details
			// Response details available for debugging if needed
			
			try {
				// Decrypt the response
				const encryptedResponseData = response.json;
				// Process response JSON
				
				const decryptedResponse = this.decryptResponse(encryptedResponseData);
				// Process decrypted response

				if (decryptedResponse) {
					// Replace the selected text with the API response
					editor.replaceSelection(decryptedResponse.content || decryptedResponse.text || '');
					new Notice('Text updated successfully');
				} else {
					new Notice('Failed to process API response');
				}
			} catch (parseError: any) {
				console.error('Error parsing/processing response:', parseError);
				new Notice(`Error processing response: ${parseError.message}`);
			}
		} catch (error: any) {
			console.error('API call failed:', error);
			
			// Provide more detailed error information
			if (error.status === 401 || error.status === 403) {
				new Notice(`Authentication failed (${error.status}): Check your API key`);
				console.error('Authentication error. Verify your API key is correct and sent in the x-api-key header.');
			} else if (error.status) {
				new Notice(`API call failed: ${error.status} ${error.message}`);
				console.error(`Server returned ${error.status}: ${error.message}`);
				
				// Log response body if available
				if (error.response) {
					try {
						console.error('Error response body:', error.response.text);
					} catch (e) {
						console.error('Could not parse error response');
					}
				}
			} else {
				new Notice(`API call failed: ${error.message}`);
			}
		}
	}
}



class RewriteSettingTab extends PluginSettingTab {
	plugin: RewritePlugin;

	constructor(app: App, plugin: RewritePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('API URL')
			.setDesc('Enter the URL of the API to call for text rewriting')
			.addText((text: any) => text
				.setPlaceholder('https://api.example.com/rewrite')
				.setValue(this.plugin.settings.apiUrl)
				.onChange(async (value: string) => {
					this.plugin.settings.apiUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Enter your API key for authentication')
			.addText((text: any) => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.apiKey ? '••••••••' : '')
				.onChange(async (value: string) => {
					if (value && value !== '••••••••') {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Encryption Key')
			.setDesc('Enter a secure encryption key to encrypt/decrypt API requests and responses')
			.addText((text: any) => text
				.setPlaceholder('Enter your encryption key')
				.setValue(this.plugin.settings.encryptionKey ? '••••••••' : '')
				.onChange(async (value: string) => {
					if (value && value !== '••••••••') {
						this.plugin.settings.encryptionKey = value;
						await this.plugin.saveSettings();
					}
				}));
				
		new Setting(containerEl)
			.setName('Model')
			.setDesc('The AI model to use for text rewriting')
			.addText((text: any) => text
				.setPlaceholder('Sonnet-3.7')
				.setValue(this.plugin.settings.model)
				.onChange(async (value: string) => {
					this.plugin.settings.model = value || 'Sonnet-3.7';
					await this.plugin.saveSettings();
				}));
	}
}
