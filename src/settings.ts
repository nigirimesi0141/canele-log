import { App, PluginSettingTab, Setting } from "obsidian";
import type CaneleLogPlugin from "./main";

export class CaneleLogSettingTab extends PluginSettingTab {
	plugin: CaneleLogPlugin;

	constructor(app: App, plugin: CaneleLogPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("記録保存フォルダ")
			.setDesc("試作記録のMarkdownノートを保存するVault内フォルダ")
			.addText((text) =>
				text
					.setPlaceholder("Canele")
					.setValue(this.plugin.settings.trialsFolder)
					.onChange(async (value) => {
						this.plugin.settings.trialsFolder = value || "Canele";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("添付ファイルフォルダ")
			.setDesc("写真の保存先フォルダ")
			.addText((text) =>
				text
					.setPlaceholder("Canele/attachments")
					.setValue(this.plugin.settings.attachmentsFolder)
					.onChange(async (value) => {
						this.plugin.settings.attachmentsFolder = value || "Canele/attachments";
						await this.plugin.saveSettings();
					})
			);
	}
}
