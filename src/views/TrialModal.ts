import { App, Modal, Setting, TFile } from "obsidian";
import { BakeStep, Ingredient, TrialFrontmatter, emptyIngredient, emptyStep } from "../types";

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
	private tagsInput!: HTMLInputElement;

	constructor(
		app: App,
		private initialFrontmatter: TrialFrontmatter,
		private initialBody: string,
		private existingFile: TFile | null,
		private allTags: string[],
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

		new Setting(contentEl).setName("タイトル").addText((text) =>
			text.setValue(this.frontmatter.title).onChange((v) => (this.frontmatter.title = v))
		);

		new Setting(contentEl).setName("日付").addText((text) => {
			text.inputEl.type = "date";
			text.setValue(this.frontmatter.date).onChange((v) => (this.frontmatter.date = v));
		});

		this.renderRating(contentEl);

		contentEl.createEl("h3", { text: "焼成工程" });
		contentEl.createEl("p", {
			cls: "canele-step-hint",
			text: "手順ごとに温度と時間を入力できます（例: 250℃で10分 → 200℃で50分）。",
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
		if (this.frontmatter.photos.length) {
			const existingList = contentEl.createDiv();
			for (const photoPath of [...this.frontmatter.photos]) {
				const row = existingList.createDiv({ cls: "canele-ingredient-row" });
				row.createSpan({ text: photoPath });
				const removeBtn = row.createEl("button", { text: "削除" });
				removeBtn.onclick = () => {
					this.frontmatter.photos = this.frontmatter.photos.filter((p) => p !== photoPath);
					this.removedPhotoPaths.push(photoPath);
					row.remove();
				};
			}
		}
		new Setting(contentEl).setName("写真を追加").addButton((btn) => {
			const input = createEl("input", { type: "file" });
			input.accept = "image/*";
			input.multiple = true;
			input.onchange = () => {
				if (input.files) this.newPhotos.push(...Array.from(input.files));
			};
			btn.buttonEl.replaceWith(input);
		});

		contentEl.createEl("h3", { text: "メモ" });
		const bodyArea = contentEl.createEl("textarea");
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
