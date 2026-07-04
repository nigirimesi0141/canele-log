import { arrayBufferToBase64, requestUrl } from "obsidian";
import { BakeStep, Ingredient } from "./types";

export interface ExtractedRecipe {
	title: string;
	category: string;
	ingredients: Ingredient[];
	steps: BakeStep[];
	body: string;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const SUPPORTED_MEDIA = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// 出力をこのプラグインのデータモデルに強制するJSONスキーマ（Structured Outputs）
const RECIPE_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		title: { type: "string" },
		category: { type: "string" },
		ingredients: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					name: { type: "string" },
					amount: { type: "number" },
					unit: { type: "string" },
				},
				required: ["name", "amount", "unit"],
			},
		},
		steps: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					label: { type: "string" },
					temp_c: { anyOf: [{ type: "number" }, { type: "null" }] },
					time_min: { anyOf: [{ type: "number" }, { type: "null" }] },
				},
				required: ["label", "temp_c", "time_min"],
			},
		},
		body: { type: "string" },
	},
	required: ["title", "category", "ingredients", "steps", "body"],
};

const SYSTEM_PROMPT =
	"あなたは料理レシピの画像を読み取り、構造化データに変換するアシスタントです。" +
	"画像に複数のレシピや無関係な文章の断片が写っている場合は、中心となる1つのレシピだけを対象にしてください。";

function buildInstruction(knownCategories: string[]): string {
	const cats = knownCategories.length ? knownCategories.join(", ") : "(登録なし)";
	return (
		"この画像のレシピを読み取り、指定のJSON形式で出力してください。\n" +
		"- title: レシピ名\n" +
		`- category: 料理の種類。次の候補に近いものがあれば使う: ${cats}。なければ適切な種類を推定。\n` +
		"- ingredients: 材料。name(材料名)/amount(数量、数値)/unit(単位)。「適量」など数値がない場合は amount を 0 にし unit にその語を入れる。まとめ記号(Aなど)は name に含めてよい。\n" +
		"- steps: 調理工程。手順ごとに label(手順の説明)、temp_c(温度℃、記載がなければ null)、time_min(時間分、記載がなければ null)。電子レンジのワット数などは label に含める。\n" +
		"- body: レシピの紹介文・補足メモ(Markdown可)。"
	);
}

export async function extractRecipeFromImage(
	apiKey: string,
	model: string,
	file: File,
	knownCategories: string[]
): Promise<ExtractedRecipe> {
	const mediaType = resolveMediaType(file);
	if (!SUPPORTED_MEDIA.includes(mediaType)) {
		throw new Error("対応していない画像形式です（JPEG / PNG / GIF / WebP のみ）");
	}

	const base64 = arrayBufferToBase64(await file.arrayBuffer());

	const requestBody = {
		model,
		max_tokens: 2000,
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "image",
						source: { type: "base64", media_type: mediaType, data: base64 },
					},
					{ type: "text", text: buildInstruction(knownCategories) },
				],
			},
		],
		output_config: { format: { type: "json_schema", schema: RECIPE_SCHEMA } },
	};

	const res = await requestUrl({
		url: ANTHROPIC_URL,
		method: "POST",
		throw: false,
		headers: {
			"x-api-key": apiKey,
			"anthropic-version": ANTHROPIC_VERSION,
			"anthropic-dangerous-direct-browser-access": "true",
			"content-type": "application/json",
		},
		body: JSON.stringify(requestBody),
	});

	if (res.status !== 200) {
		throw new Error(`APIエラー (${res.status}): ${extractApiError(res.text)}`);
	}

	const text = firstTextBlock(res.json);
	if (!text) throw new Error("応答にテキストが含まれていませんでした");

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error("応答をJSONとして解析できませんでした");
	}
	return normalizeRecipe(parsed as Record<string, unknown>);
}

function resolveMediaType(file: File): string {
	if (file.type && SUPPORTED_MEDIA.includes(file.type)) return file.type;
	const ext = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "";
	switch (ext) {
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "png":
			return "image/png";
		case "gif":
			return "image/gif";
		case "webp":
			return "image/webp";
		default:
			return file.type || "";
	}
}

function firstTextBlock(data: unknown): string | null {
	const content = (data as { content?: unknown })?.content;
	if (!Array.isArray(content)) return null;
	for (const block of content) {
		if (block && block.type === "text" && typeof block.text === "string") {
			return block.text;
		}
	}
	return null;
}

function extractApiError(text: string | undefined): string {
	if (!text) return "不明なエラー";
	try {
		const j = JSON.parse(text);
		return j?.error?.message ?? text.slice(0, 200);
	} catch {
		return text.slice(0, 200);
	}
}

function toNum(v: unknown): number | null {
	if (v === null || v === undefined || v === "") return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function normalizeRecipe(raw: Record<string, unknown>): ExtractedRecipe {
	const ingredients: Ingredient[] = Array.isArray(raw.ingredients)
		? raw.ingredients.map((i: Record<string, unknown>) => ({
				name: typeof i?.name === "string" ? i.name : "",
				amount: toNum(i?.amount) ?? 0,
				unit: typeof i?.unit === "string" ? i.unit : "",
		  }))
		: [];

	const steps: BakeStep[] = Array.isArray(raw.steps)
		? raw.steps.map((s: Record<string, unknown>) => ({
				label: typeof s?.label === "string" ? s.label : "",
				temp_c: toNum(s?.temp_c),
				time_min: toNum(s?.time_min),
		  }))
		: [];

	return {
		title: typeof raw.title === "string" ? raw.title : "",
		category: typeof raw.category === "string" ? raw.category : "",
		ingredients,
		steps,
		body: typeof raw.body === "string" ? raw.body : "",
	};
}
