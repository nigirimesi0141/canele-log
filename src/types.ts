export interface Ingredient {
	name: string;
	amount: number;
	unit: string;
}

export interface BakeStep {
	label: string;
	temp_c: number | null;
	time_min: number | null;
}

export interface TrialFrontmatter {
	id: string;
	title: string;
	date: string;
	rating: number;
	based_on: string | null;
	steps: BakeStep[];
	ingredients: Ingredient[];
	photos: string[];
	tags: string[];
}

export interface TrialRecord {
	frontmatter: TrialFrontmatter;
	body: string;
	path: string;
}

export interface CaneleLogSettings {
	trialsFolder: string;
	attachmentsFolder: string;
}

export const DEFAULT_SETTINGS: CaneleLogSettings = {
	trialsFolder: "Canele",
	attachmentsFolder: "Canele/attachments",
};

export const BASE_TAG = "canele";

export function emptyIngredient(): Ingredient {
	return { name: "", amount: 0, unit: "g" };
}

export function emptyStep(): BakeStep {
	return { label: "", temp_c: null, time_min: null };
}

export function defaultFrontmatter(): TrialFrontmatter {
	const now = new Date();
	return {
		id: formatId(now),
		title: "",
		date: formatDate(now),
		rating: 3,
		based_on: null,
		steps: [emptyStep()],
		ingredients: [emptyIngredient()],
		photos: [],
		tags: [BASE_TAG],
	};
}

export function formatId(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return (
		`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
		`${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
	);
}

export function formatDate(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
