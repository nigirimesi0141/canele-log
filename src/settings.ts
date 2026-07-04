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
					.setPlaceholder("Recipes")
					.setValue(this.plugin.settings.trialsFolder)
					.onChange(async (value) => {
						this.plugin.settings.trialsFolder = value || "Recipes";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("添付ファイルフォルダ")
			.setDesc("写真の保存先フォルダ")
			.addText((text) =>
				text
					.setPlaceholder("Recipes/attachments")
					.setValue(this.plugin.settings.attachmentsFolder)
					.onChange(async (value) => {
						this.plugin.settings.attachmentsFolder = value || "Recipes/attachments";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("カテゴリ一覧")
			.setDesc("料理の種類をカンマ区切りで登録（例: カヌレ, カレー, 食パン）。記録時の候補に表示されます。")
			.addTextArea((text) =>
				text
					.setPlaceholder("カヌレ, カレー, 食パン")
					.setValue(this.plugin.settings.categories.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.categories = value
							.split(",")
							.map((c) => c.trim())
							.filter((c) => c.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("デフォルトカテゴリ")
			.setDesc("新規記録を作成したときに最初から選ばれるカテゴリ（空でも可）")
			.addText((text) =>
				text
					.setPlaceholder("カヌレ")
					.setValue(this.plugin.settings.defaultCategory)
					.onChange(async (value) => {
						this.plugin.settings.defaultCategory = value.trim();
						await this.plugin.saveSettings();
					})
			);
	}
}
