import { setIcon } from 'obsidian';
import type { FormField, FormInfo, FormOption } from '@opencode/client';
import { defaultValues, fieldType, isFieldVisible, safeExternalUrl, unsupportedFields, validateForm } from './form-validation';
import type { FormValue, FormValues } from './form-validation';

export type { FormValue, FormValues } from './form-validation';

export interface FormCallbacks {
	submit(answer: Record<string, FormValue>): void;
	cancel(): void;
	openExternal(url: string): void;
}

interface FieldControl {
	readonly controlId: string;
	readonly labelId: string;
	readonly title: string;
	readonly describedBy: string;
}

const RECOMMENDED_MARKER = /\s*\(recommended\)\s*/i;
const CUSTOM_CHOICE = '\u0000custom';

function optionLabel(label: string): string {
	return label.replace(RECOMMENDED_MARKER, ' ').trim();
}

function isRecommended(label: string): boolean {
	return RECOMMENDED_MARKER.test(label);
}

let formCardSequence = 0;

/** A form card keeps its in-progress answers across view refreshes. */
export class FormCard {
	readonly el: HTMLElement;
	private readonly uid = ++formCardSequence;
	private readonly titleEl: HTMLElement;
	private readonly errorEl: HTMLElement;
	private readonly submitButton: HTMLButtonElement;
	private readonly cancelButton: HTMLButtonElement;
	private readonly fieldsEl: HTMLElement;
	private readonly controls = new Map<string, {
		wrapper: HTMLElement; element: HTMLElement; update(values: FormValues): void;
		error: HTMLElement; staticError?: string;
	}>();
	private readonly customChoice = new Set<string>();
	private readonly customText = new Map<string, string>();
	private values: FormValues;
	private busy = false;
	private signature: string;
	constructor(container: HTMLElement, private form: FormInfo, private readonly callbacks: FormCallbacks) {
		this.values = defaultValues(form.fields);
		this.signature = JSON.stringify(form.fields);
		this.el = container.createDiv({ cls: 'callout opencode-form' });
		this.el.setAttribute('data-callout', 'question');
		const title = this.el.createDiv({ cls: 'callout-title' });
		const icon = title.createDiv({ cls: 'callout-icon' });
		setIcon(icon, 'help-circle');
		this.titleEl = title.createDiv({ cls: 'callout-title-inner' });
		const content = this.el.createDiv({ cls: 'callout-content' });
		this.fieldsEl = content.createDiv({ cls: 'opencode-form-fields' });
		this.errorEl = content.createDiv({ cls: 'opencode-form-error' });
		const actions = content.createDiv({ cls: 'opencode-form-actions' });
		this.submitButton = actions.createEl('button', { text: 'Submit', cls: 'mod-cta' });
		this.cancelButton = actions.createEl('button', { text: 'Cancel' });
		this.submitButton.addEventListener('click', () => this.submit());
		this.cancelButton.addEventListener('click', () => { if (!this.busy) this.callbacks.cancel(); });
		this.build();
	}

	update(form: FormInfo, busy: boolean): void {
		this.busy = busy;
		const signature = JSON.stringify(form.fields);
		if (signature !== this.signature) {
			this.form = form;
			this.signature = signature;
			this.values = defaultValues(form.fields);
			this.customChoice.clear();
			this.customText.clear();
			this.build();
		} else this.form = form;
		this.titleEl.setText(form.title?.trim() || 'Agent question');
		this.refresh();
	}

	dispose(): void { this.el.remove(); }

	private build(): void {
		this.fieldsEl.empty();
		this.controls.clear();
		this.titleEl.setText(this.form.title?.trim() || 'Agent question');
		const unsupported = unsupportedFields(this.form.fields);
		if (unsupported.length) {
			this.errorEl.setText(`This form uses unsupported fields (${unsupported.join(', ')}). Update the plugin rather than submitting an incomplete answer.`);
			this.el.toggleClass('is-unsupported', true);
		} else {
			this.errorEl.setText('');
			this.el.toggleClass('is-unsupported', false);
			for (const field of this.form.fields) this.buildField(field);
		}
		this.refresh();
	}

	private buildField(field: FormField): void {
		const type = fieldType(field);
		const options = (field as { readonly options?: readonly FormOption[] }).options ?? [];
		const grouped = type === 'string' && options.length > 0;
		const wrapper = this.fieldsEl.createDiv({ cls: `setting-item opencode-form-field opencode-form-${type}` });
		const info = wrapper.createDiv({ cls: 'setting-item-info' });
		const title = (field as { readonly title?: string }).title ?? field.key;
		const required = Boolean((field as { readonly required?: boolean }).required);
		const description = (field as { readonly description?: string }).description;
		const ids = this.fieldIds(field, title, Boolean(description));
		const name = info.createEl(type === 'external' || grouped || type === 'multiselect' ? 'div' : 'label', {
			cls: 'setting-item-name', text: required ? `${title} *` : title,
			attr: { id: ids.labelId },
		});
		if (description) {
			info.createDiv({ cls: 'setting-item-description', text: description, attr: { id: ids.descriptionId } });
		}
		const control = wrapper.createDiv({ cls: 'setting-item-control' });
		const error = wrapper.createDiv({
			cls: 'setting-item-error', attr: { id: ids.errorId, 'aria-live': 'polite' },
		});
		if (type === 'external') {
			const external = field as FormField & { readonly url: string; readonly title?: string };
			const href = safeExternalUrl(external.url);
			if (!href) {
				error.setText('This external link uses an unsupported URL.');
				this.controls.set(field.key, {
					wrapper, element: wrapper, update: () => this.refresh(), error,
					staticError: 'This external link uses an unsupported URL.',
				});
				return;
			}
			const link = control.createEl('a', { text: external.title ?? external.url, href,
				attr: { id: ids.controlId, 'aria-describedby': ids.describedBy } });
			link.addEventListener('click', (event) => { event.preventDefault(); this.callbacks.openExternal(href); });
			this.controls.set(field.key, { wrapper, element: wrapper, update: () => this.refresh(), error });
			return;
		}
		const input = this.createInput(field, type, control, ids);
		if (!grouped && type !== 'multiselect' && type !== 'external') name.setAttribute('for', ids.controlId);
		this.controls.set(field.key, { wrapper, element: input, update: () => this.refresh(), error });
		input.addEventListener('input', () => this.refresh());
		input.addEventListener('change', () => this.refresh());
	}

	private fieldIds(field: FormField, title: string, hasDescription: boolean): {
		controlId: string; labelId: string; descriptionId: string; errorId: string;
		title: string; describedBy: string;
	} {
		const key = field.key.replace(/[^A-Za-z0-9_-]/gu, '-');
		const base = `opencode-form-${this.uid}-${key}`;
		return {
			controlId: `${base}-control`, labelId: `${base}-label`,
			descriptionId: `${base}-description`, errorId: `${base}-error`, title,
			describedBy: [hasDescription ? `${base}-description` : '', `${base}-error`].filter(Boolean).join(' '),
		};
	}

	private createInput(field: FormField, type: string, control: HTMLElement,
		ids: Pick<FieldControl, 'controlId' | 'labelId' | 'title' | 'describedBy'>): HTMLElement {
		const key = field.key;
		const label = <T extends HTMLElement>(element: T): T => {
			element.id = ids.controlId;
			element.setAttribute('aria-describedby', ids.describedBy);
			return element;
		};
		if (type === 'string') {
			const options = (field as { readonly options?: readonly FormOption[] }).options;
			if (options?.length) return this.createChoice(field, type, control, options, ids);
			const input = label(control.createEl('input', { type: 'text', cls: 'opencode-form-input' }));
			input.placeholder = (field as { readonly placeholder?: string }).placeholder ?? '';
			input.value = typeof this.values[key] === 'string' ? String(this.values[key]) : '';
			input.addEventListener('input', () => { this.values[key] = input.value; });
			return input;
		}
		if (type === 'number' || type === 'integer') {
			const input = label(control.createEl('input', { type: 'number', cls: 'opencode-form-input' }));
			input.step = type === 'integer' ? '1' : 'any';
			const limits = field as FormField & { readonly minimum?: number; readonly maximum?: number };
			if (typeof limits.minimum === 'number') input.min = String(limits.minimum);
			if (typeof limits.maximum === 'number') input.max = String(limits.maximum);
			input.value = typeof this.values[key] === 'number' ? String(this.values[key]) : '';
			input.addEventListener('input', () => {
				if (input.value === '') delete this.values[key];
				else {
					const value = Number(input.value);
					if (Number.isFinite(value)) this.values[key] = value;
				}
			});
			return input;
		}
		if (type === 'boolean') {
			const group = control.createEl('label', { cls: 'opencode-form-checkbox' });
			const input = label(group.createEl('input', { type: 'checkbox' }));
			input.checked = this.values[key] === true;
			input.addEventListener('change', () => { this.values[key] = input.checked; });
			group.createSpan({ text: 'Yes' });
			return input;
		}
		return this.createChoice(field, type, control, (field as { readonly options?: readonly FormOption[] }).options ?? [], ids);
	}

	private createChoice(field: FormField, type: string, control: HTMLElement,
		options: readonly FormOption[], ids: Pick<FieldControl, 'controlId' | 'labelId' | 'title' | 'describedBy'>): HTMLElement {
		const key = field.key;
		const multiple = type === 'multiselect';
		const custom = Boolean((field as { readonly custom?: boolean }).custom);
		const group = control.createDiv({ cls: 'opencode-form-options', attr: {
			role: multiple ? 'group' : 'radiogroup', 'aria-labelledby': ids.labelId, 'aria-describedby': ids.describedBy,
		} });
		group.id = ids.controlId;
		const allowed = new Set(options.map((option) => option.value));
		const radioName = `opencode-form-${this.uid}-${key.replace(/[^A-Za-z0-9_-]/gu, '-')}`;

		if (multiple) {
			const current = Array.isArray(this.values[key])
				? this.values[key].filter((item): item is string => typeof item === 'string') : [];
			const selected = new Set(current.filter((value) => allowed.has(value)));
			const extras = current.filter((value) => !allowed.has(value));
			if (custom && extras.length) {
				this.customChoice.add(key);
				this.customText.set(key, extras.join(', '));
			}
			const sync = (): void => {
				const values = [...selected];
				if (custom && this.customChoice.has(key)) {
					const extra = this.customText.get(key) ?? '';
					values.push(...extra.split(',').map((value) => value.trim()).filter(Boolean));
				}
				this.values[key] = values;
			};
			for (const option of options) {
				const row = this.optionRow(group, option, true, (input) => {
					if (input.checked) selected.add(option.value); else selected.delete(option.value);
					sync();
				});
				row.input.checked = selected.has(option.value);
			}
			if (custom) this.customRow(group, key, ids, true, sync);
			sync();
			return group;
		}

		const selected = typeof this.values[key] === 'string' ? String(this.values[key]) : '';
		if (custom && selected && !allowed.has(selected)) {
			this.customChoice.add(key);
			this.customText.set(key, selected);
		}
		for (const option of options) {
			const row = this.optionRow(group, option, false, (input) => {
				if (!input.checked) return;
				this.customChoice.delete(key);
				this.values[key] = option.value;
				const customField = group.querySelector<HTMLElement>('.opencode-form-custom');
				if (customField) customField.hidden = true;
			});
			row.input.checked = this.values[key] === option.value || selected === option.value;
		}
		if (custom) {
			this.customRow(group, key, ids, false, () => undefined).input.name = radioName;
		}
		for (const input of group.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
			if (!input.name) input.name = radioName;
		}
		return group;
	}

	private optionRow(group: HTMLElement, option: FormOption, multiple: boolean,
		onChange: (input: HTMLInputElement) => void): {
		row: HTMLElement; input: HTMLInputElement;
	} {
		const row = group.createEl('label', { cls: 'opencode-form-option' });
		const input = row.createEl('input', { type: multiple ? 'checkbox' : 'radio', attr: { value: option.value } });
		const main = row.createDiv({ cls: 'opencode-form-option-main' });
		const title = main.createDiv({ cls: 'opencode-form-option-title' });
		title.createSpan({ cls: 'opencode-form-option-label', text: optionLabel(option.label) || option.value });
		if (isRecommended(option.label)) {
			title.createSpan({ cls: 'opencode-form-option-recommended', text: 'Recommended' });
		}
		if (option.description) {
			main.createDiv({ cls: 'opencode-form-option-description', text: option.description });
		}
		input.addEventListener('change', () => onChange(input));
		return { row, input };
	}

	private customRow(group: HTMLElement, key: string, ids: Pick<FieldControl, 'title' | 'describedBy'>, multiple: boolean,
		sync: () => void): { input: HTMLInputElement; field: HTMLElement; text: HTMLInputElement } {
		const row = group.createEl('label', { cls: 'opencode-form-option opencode-form-option-custom' });
		const input = row.createEl('input', { type: multiple ? 'checkbox' : 'radio', attr: { value: CUSTOM_CHOICE } });
		input.checked = this.customChoice.has(key);
		const main = row.createDiv({ cls: 'opencode-form-option-main' });
		const title = main.createDiv({ cls: 'opencode-form-option-title' });
		const icon = title.createSpan({ cls: 'opencode-form-option-icon' });
		setIcon(icon, 'edit');
		title.createSpan({ cls: 'opencode-form-option-label', text: 'Other…' });
		const field = group.createDiv({ cls: 'opencode-form-custom' });
		field.hidden = !input.checked;
		const text = field.createEl('input', { type: 'text', cls: 'opencode-form-input',
			attr: { 'aria-label': multiple ? `${ids.title} (other values)` : `${ids.title} (other answer)`,
				'aria-describedby': ids.describedBy } });
		text.placeholder = multiple ? 'Other values, separated by commas' : 'Other answer';
		text.value = this.customText.get(key) ?? '';
		const toggle = (): void => {
			field.hidden = !input.checked;
			if (input.checked) {
				this.customChoice.add(key);
				this.customText.set(key, text.value);
				if (multiple) sync();
				else {
					this.values[key] = text.value;
					text.focus();
				}
			} else {
				this.customChoice.delete(key);
				if (multiple) sync();
			}
		};
		input.addEventListener('change', toggle);
		text.addEventListener('input', () => {
			this.customText.set(key, text.value);
			if (!this.customChoice.has(key)) return;
			if (multiple) sync(); else this.values[key] = text.value;
		});
		return { input, field, text };
	}

	private refresh(): void {
		const validation = validateForm(this.form.fields, this.values);
		for (const [key, control] of this.controls) {
			const field = this.form.fields.find((candidate) => candidate.key === key);
			const visible = field ? isFieldVisible(field, this.values) : false;
			control.wrapper.hidden = !visible;
			const error = control.staticError ?? validation.errors[key] ?? '';
			if (control.error.textContent !== error) control.error.setText(error);
			control.wrapper.toggleClass('is-invalid', Boolean(error));
			if (control.element.matches('input, select, textarea, [role="group"], [role="radiogroup"]')) {
				control.element.setAttribute('aria-invalid', String(Boolean(error)));
			}
		}
		const unsupported = validation.unsupported.length > 0;
		this.submitButton.disabled = this.busy || unsupported;
		this.cancelButton.disabled = this.busy;
	}

	private submit(): void {
		if (this.busy) return;
		const validation = validateForm(this.form.fields, this.values);
		if (validation.unsupported.length) {
			this.errorEl.setText('This form cannot be submitted because it contains unsupported fields.');
			return;
		}
		if (Object.keys(validation.errors).length) {
			this.errorEl.setText('Complete the required fields and correct the highlighted answers.');
			this.refresh();
			return;
		}
		this.errorEl.setText('');
		this.callbacks.submit(validation.answer);
	}
}
