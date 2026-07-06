import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import { BakeStep, Ingredient, TrialFrontmatter, emptyIngredient, emptyStep } from "../types";
import { ExtractedRecipe } from "../recipeExtractor";

export interface TrialModalResult {
	frontmatter: TrialFrontmatter;
	body: string;
	newPhotos: File[];
	removedPhotoPaths: string[];
}

export class TrialModal extends Modal {
	private frontmatter: TrialFrontmatter;
	private body: string;
	private newPhotos: File[] = [];
	private removedPhotoPaths: string[] = [];
	private ingredientsListEl!: HTMLElement;
	private stepsListEl!: HTMLElement;
	private photosListEl!: HTMLElement;
	private objectUrls: string[] = [];
	private tagsInput!: HTMLInputElement;
	private titleInput!: HTMLInputElement;
	private categoryInput!: HTMLInputElement;
	private bodyArea!: HTMLTextAreaElement;

	constructor(
		app: App,
		private initialFrontmatter: TrialFrontmatter,
		private initialBody: string,
		private existingFile: TFile | null,
		private allTags: string[],
		private allCategories: string[],
		private extractImage: ((file: File) => Promise<ExtractedRecipe>) | null,
		private onSubmit: (result: TrialModalResult) => void
	) {
		super(app);
		this.frontmatter = {
			...initialFrontmatter,
			steps: initialFrontmatter.steps.map((s) => ({ ...s })),
			ingredients: initialFrontmatter.ingredients.map((i) => ({ ...i })),
			photos: [...initialFrontmatter.photos],
			tags: [...initialFrontmatter.tags],
		};
		this.body = initialBody;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("canele-log-modal");
		contentEl.createEl("h2", {
			text: this.existingFile ? "試作記録を編集" : "新しい試作を記録",
		});

		if (this.extractImage) this.renderImageImport(contentEl);

		new Setting(contentEl).setName("タイトル").addText((text) => {
			this.titleInput = text.inputEl;
			text.setValue(this.frontmatter.title).onChange((v) => (this.frontmatter.title = v));
		});

		new Setting(contentEl).setName("日付").addText((text) => {
			text.inputEl.type = "date";
			text.setValue(this.frontmatter.date).onChange((v) => (this.frontmatter.date = v));
		});

		new Setting(contentEl)
			.setName("カテゴリ")
			.setDesc("料理の種類（例: カヌレ、カレー）")
			.addText((text) => {
				this.categoryInput = text.inputEl;
				text.setValue(this.frontmatter.category);
				text.onChange((v) => (this.frontmatter.category = v.trim()));
				const listId = "canele-category-suggestions";
				text.inputEl.setAttr("list", listId);
				const datalist = contentEl.createEl("datalist", { attr: { id: listId } });
				for (const c of this.allCategories) datalist.createEl("option", { value: c });
			});

		this.renderRating(contentEl);

		contentEl.createEl("h3", { text: "調理工程" });
		contentEl.createEl("p", {
			cls: "canele-step-hint",
			text: "手順ごとに温度・時間を入力できます（温度/時間は任意。例: 250℃で10分 → 200℃で50分、煮込み100℃で30分 など）。",
		});
		this.stepsListEl = contentEl.createDiv();
		this.renderSteps();
		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("+ 工程を追加").onClick(() => {
				this.frontmatter.steps.push(emptyStep());
				this.renderSteps();
			})
		);

		contentEl.createEl("h3", { text: "材料配合" });
		this.ingredientsListEl = contentEl.createDiv();
		this.renderIngredients();
		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("+ 材料を追加").onClick(() => {
				this.frontmatter.ingredients.push(emptyIngredient());
				this.renderIngredients();
			})
		);

		contentEl.createEl("h3", { text: "タグ" });
		const tagSetting = new Setting(contentEl)
			.setName("タグ（カンマ区切り）")
			.setDesc(this.allTags.length ? `既存タグ: ${this.allTags.join(", ")}` : "");
		tagSetting.addText((text) => {
			this.tagsInput = text.inputEl;
			text.setValue(this.frontmatter.tags.join(", "));
			const listId = "canele-tag-suggestions";
			text.inputEl.setAttr("list", listId);
			const datalist = contentEl.createEl("datalist", { attr: { id: listId } });
			for (const tag of this.allTags) datalist.createEl("option", { value: tag });
		});

		contentEl.createEl("h3", { text: "写真" });
		this.photosListEl = contentEl.createDiv();
		this.renderPhotos();
		new Setting(contentEl).setName("写真を追加").addButton((btn) => {
			const input = createEl("input", { type: "file" });
			input.accept = "image/*";
			input.multiple = true;
			input.onchange = () => {
				if (input.files) this.newPhotos.push(...Array.from(input.files));
				this.renderPhotos();
			};
			btn.buttonEl.replaceWith(input);
		});

		contentEl.createEl("h3", { text: "メモ" });
		const bodyArea = contentEl.createEl("textarea");
		this.bodyArea = bodyArea;
		bodyArea.rows = 6;
		bodyArea.style.width = "100%";
		bodyArea.value = this.body;
		bodyArea.onchange = () => (this.body = bodyArea.value);

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("保存")
				.setCta()
				.onClick(() => this.handleSubmit())
		);
	}

	private renderImageImport(container: HTMLElement) {
		const setting = new Setting(container)
			.setName("📷 画像から入力")
			.setDesc("レシピ写真を選ぶと、材料・工程などを自動入力し、写真にも追加します");
		const input = createEl("input", { type: "file" });
		input.accept = "image/*";
		input.onchange = async () => {
			const file = input.files?.[0];
			input.value = "";
			if (!file || !this.extractImage) return;

			// 入力画像は写真欄にも保存する（読み取り前にサムネイル表示）
			this.newPhotos.push(file);
			this.renderPhotos();

			const notice = new Notice("画像を読み取っています…", 0);
			try {
				const recipe = await this.extractImage(file);
				this.applyExtraction(recipe);
				new Notice("読み取り完了。内容を確認して保存してください");
			} catch (e) {
				new Notice(`読み取りに失敗しました: ${e instanceof Error ? e.message : e}`);
			} finally {
				notice.hide();
			}
		};
		setting.controlEl.appendChild(input);
	}

	private applyExtraction(recipe: ExtractedRecipe) {
		if (recipe.title) {
			this.frontmatter.title = recipe.title;
			this.titleInput.value = recipe.title;
		}
		if (recipe.category) {
			this.frontmatter.category = recipe.category;
			this.categoryInput.value = recipe.category;
		}
		if (recipe.ingredients.length) {
			this.frontmatter.ingredients = recipe.ingredients;
			this.renderIngredients();
		}
		if (recipe.steps.length) {
			this.frontmatter.steps = recipe.steps;
			this.renderSteps();
		}
		if (recipe.body) {
			this.body = recipe.body;
			this.bodyArea.value = recipe.body;
		}
	}

	private renderRating(container: HTMLElement) {
		const setting = new Setting(container).setName("評価");
		const starsEl = setting.controlEl.createDiv({ cls: "canele-star-rating" });
		const stars: HTMLElement[] = [];
		for (let i = 1; i <= 5; i++) {
			const star = starsEl.createSpan({ cls: "canele-star", text: "★" });
			star.onclick = () => {
				this.frontmatter.rating = i;
				stars.forEach((s, idx) => s.toggleClass("is-active", idx < i));
			};
			stars.push(star);
		}
		stars.forEach((s, idx) => s.toggleClass("is-active", idx < this.frontmatter.rating));
	}

	private renderIngredients() {
		this.ingredientsListEl.empty();
		this.frontmatter.ingredients.forEach((ingredient: Ingredient, idx: number) => {
			const row = this.ingredientsListEl.createDiv({ cls: "canele-ingredient-row" });
			const nameInput = row.createEl("input", { type: "text", placeholder: "材料名" });
			nameInput.value = ingredient.name;
			nameInput.onchange = () => (ingredient.name = nameInput.value);

			const amountInput = row.createEl("input", { type: "number", placeholder: "分量" });
			amountInput.value = String(ingredient.amount);
			amountInput.onchange = () => (ingredient.amount = Number(amountInput.value));

			const unitInput = row.createEl("input", { type: "text", placeholder: "単位" });
			unitInput.value = ingredient.unit;
			unitInput.style.flex = "0.5";
			unitInput.onchange = () => (ingredient.unit = unitInput.value);

			const removeBtn = row.createEl("button", { text: "×" });
			removeBtn.onclick = () => {
				this.frontmatter.ingredients.splice(idx, 1);
				this.renderIngredients();
			};
		});
	}

	private renderSteps() {
		this.stepsListEl.empty();
		this.frontmatter.steps.forEach((step: BakeStep, idx: number) => {
			const row = this.stepsListEl.createDiv({ cls: "canele-step-row" });
			row.createSpan({ cls: "canele-step-index", text: `${idx + 1}.` });

			const labelInput = row.createEl("input", { type: "text", placeholder: "手順（例: 予熱後に投入）" });
			labelInput.value = step.label;
			labelInput.onchange = () => (step.label = labelInput.value);

			const tempInput = row.createEl("input", { type: "number", placeholder: "温度℃" });
			tempInput.value = step.temp_c != null ? String(step.temp_c) : "";
			tempInput.style.flex = "0.5";
			tempInput.onchange = () => (step.temp_c = tempInput.value ? Number(tempInput.value) : null);

			const timeInput = row.createEl("input", { type: "number", placeholder: "分" });
			timeInput.value = step.time_min != null ? String(step.time_min) : "";
			timeInput.style.flex = "0.5";
			timeInput.onchange = () => (step.time_min = timeInput.value ? Number(timeInput.value) : null);

			const removeBtn = row.createEl("button", { text: "×" });
			removeBtn.onclick = () => {
				this.frontmatter.steps.splice(idx, 1);
				this.renderSteps();
			};
		});
	}

	private renderPhotos() {
		this.photosListEl.empty();

		// 保存済みの写真（サムネイル表示。先頭がカバー画像）
		this.frontmatter.photos.forEach((photoPath, idx) => {
			const item = this.photosListEl.createDiv({ cls: "canele-photo-item" });
			const file = this.app.vault.getAbstractFileByPath(normalizePath(photoPath));
			if (file instanceof TFile) {
				const img = item.createEl("img", { cls: "canele-photo-thumb" });
				img.src = this.app.vault.getResourcePath(file);
				img.onclick = () => this.app.workspace.getLeaf(true).openFile(file);
			} else {
				item.createSpan({ text: photoPath });
			}
			if (idx === 0) {
				item.createSpan({ cls: "canele-photo-cover-badge", text: "カバー" });
			} else {
				const coverBtn = item.createEl("button", { text: "カバーにする" });
				coverBtn.onclick = () => {
					this.frontmatter.photos.splice(idx, 1);
					this.frontmatter.photos.unshift(photoPath);
					this.renderPhotos();
				};
			}
			const removeBtn = item.createEl("button", { text: "削除" });
			removeBtn.onclick = () => {
				this.frontmatter.photos = this.frontmatter.photos.filter((p) => p !== photoPath);
				this.removedPhotoPaths.push(photoPath);
				this.renderPhotos();
			};
		});

		// 追加したばかりの未保存の写真（読み取り元画像もここに出る）
		this.newPhotos.forEach((file, idx) => {
			const item = this.photosListEl.createDiv({ cls: "canele-photo-item" });
			const url = URL.createObjectURL(file);
			this.objectUrls.push(url);
			const img = item.createEl("img", { cls: "canele-photo-thumb" });
			img.src = url;
			item.createSpan({ cls: "canele-photo-new", text: "（未保存）" });
			const removeBtn = item.createEl("button", { text: "削除" });
			removeBtn.onclick = () => {
				this.newPhotos.splice(idx, 1);
				this.renderPhotos();
			};
		});
	}

	private handleSubmit() {
		const tags = this.tagsInput.value
			.split(",")
			.map((t) => t.trim())
			.filter((t) => t.length > 0);
		this.frontmatter.tags = tags;
		this.close();
		this.onSubmit({
			frontmatter: this.frontmatter,
			body: this.body,
			newPhotos: this.newPhotos,
			removedPhotoPaths: this.removedPhotoPaths,
		});
	}

	onClose(): void {
		for (const url of this.objectUrls) URL.revokeObjectURL(url);
		this.objectUrls = [];
		this.contentEl.empty();
	}
}

function createEl<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	attrs: Partial<HTMLElementTagNameMap[K]>
): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	Object.assign(el, attrs);
	return el;
}
