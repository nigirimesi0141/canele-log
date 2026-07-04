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

		containerEl.createEl("h3", { text: "画像からの読み取り（任意）" });
		containerEl.createEl("p", {
			cls: "canele-settings-note",
			text:
				"レシピ写真から材料・工程などを自動入力する機能です。Anthropic の API キーを設定すると有効になります。" +
				"キーは Vault 内（.obsidian）に平文保存され、Vault を同期していると他端末にも同期されます。用途を限定した専用キーの利用を推奨します。",
		});

		new Setting(containerEl)
			.setName("Anthropic API キー")
			.setDesc("空欄にすると画像読み取り機能は無効になります")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("sk-ant-...")
					.setValue(this.plugin.settings.anthropicApiKey)
					.onChange(async (value) => {
						this.plugin.settings.anthropicApiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("読み取りモデル")
			.setDesc("安いHaiku / バランスのSonnet / 高精度のOpus から選択")
			.addDropdown((drop) =>
				drop
					.addOption("claude-haiku-4-5", "Haiku 4.5（安い・推奨）")
					.addOption("claude-sonnet-5", "Sonnet 5（バランス）")
					.addOption("claude-opus-4-8", "Opus 4.8（高精度）")
					.setValue(this.plugin.settings.visionModel)
					.onChange(async (value) => {
						this.plugin.settings.visionModel = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
