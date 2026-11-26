import type { FormField, FormInfo } from '@opencode/client';
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

let formCardSequence = 0;

/** A form card keeps its in-progress answers across view refreshes. */
export class FormCard {
	readonly el: HTMLElement;
	private readonly uid = ++formCardSequence;
	private readonly errorEl: HTMLElement;
	private readonly submitButton: HTMLButtonElement;
	private readonly cancelButton: HTMLButtonElement;
	private readonly fieldsEl: HTMLElement;
	private readonly controls = new Map<string, {
		wrapper: HTMLElement; element: HTMLElement; update(values: FormValues): void;
		error: HTMLElement; staticError?: string;
	}>();
	private values: FormValues;
	private busy = false;
	private signature: string;
	constructor(container: HTMLElement, private form: FormInfo, private readonly callbacks: FormCallbacks) {
		this.values = defaultValues(form.fields);
		this.signature = JSON.stringify(form.fields);
		this.el = container.createDiv({ cls: 'opencode-form' });
		this.el.createEl('h3', { text: form.title || 'Agent question' });
		this.fieldsEl = this.el.createDiv({ cls: 'opencode-form-fields' });
		this.errorEl = this.el.createDiv({ cls: 'opencode-form-error' });
		const actions = this.el.createDiv({ cls: 'opencode-form-actions' });
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
			this.build();
		} else this.form = form;
		this.refresh();
	}

	dispose(): void { this.el.remove(); }

	private build(): void {
		this.fieldsEl.empty();
		this.controls.clear();
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
		const wrapper = this.fieldsEl.createDiv({ cls: `setting-item opencode-form-field opencode-form-${type}` });
		const info = wrapper.createDiv({ cls: 'setting-item-info' });
		const title = (field as { readonly title?: string }).title ?? field.key;
		const required = Boolean((field as { readonly required?: boolean }).required);
		const description = (field as { readonly description?: string }).description;
		const ids = this.fieldIds(field, title, Boolean(description));
		const name = info.createEl(type === 'external' ? 'div' : 'label', {
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
		if (type !== 'multiselect') name.setAttribute('for', ids.controlId);
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
			const options = (field as { readonly options?: readonly { value: string; label: string }[] }).options;
			if (options?.length) {
				const custom = Boolean((field as { readonly custom?: boolean }).custom);
				const select = label(control.createEl('select'));
				select.createEl('option', { text: 'Select…', value: '' });
				for (const option of options) select.createEl('option', { text: option.label, value: option.value });
				if (custom) select.createEl('option', { text: 'Other…', value: '__custom__' });
				select.value = typeof this.values[key] === 'string' ? String(this.values[key]) : '';
				let customInput: HTMLInputElement | undefined;
				if (custom) {
					customInput = control.createEl('input', { type: 'text', cls: 'opencode-form-input',
						attr: { 'aria-label': `${ids.title} (other answer)`, 'aria-describedby': ids.describedBy } });
					customInput.placeholder = 'Other answer';
					customInput.hidden = select.value !== '__custom__';
					customInput.value = select.value === '__custom__' ? String(this.values[key] ?? '') : '';
					customInput.addEventListener('input', () => { this.values[key] = customInput?.value ?? ''; });
				}
				select.addEventListener('change', () => {
					if (customInput) customInput.hidden = select.value !== '__custom__';
					this.values[key] = select.value === '__custom__' ? customInput?.value ?? '' : select.value;
					if (!select.value) delete this.values[key];
				});
				if (select.value === '__custom__' && !customInput?.value) delete this.values[key];
				return select;
			}
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
		if (type === 'multiselect') {
			const group = control.createDiv({ cls: 'opencode-form-options',
				attr: { role: 'group', 'aria-labelledby': ids.labelId, 'aria-describedby': ids.describedBy } });
			const selected = new Set(Array.isArray(this.values[key])
				? this.values[key].filter((item): item is string => typeof item === 'string') : []);
			const options = (field as { readonly options?: readonly { value: string; label: string }[] }).options ?? [];
			for (const option of options) {
				const optionLabel = group.createEl('label', { cls: 'opencode-form-checkbox' });
				const input = optionLabel.createEl('input', { type: 'checkbox' });
				input.checked = selected.has(option.value);
				input.addEventListener('change', () => {
					if (input.checked) selected.add(option.value); else selected.delete(option.value);
					this.values[key] = [...selected];
				});
				optionLabel.createSpan({ text: option.label });
			}
			if ((field as { readonly custom?: boolean }).custom) {
				const custom = control.createEl('input', { type: 'text', cls: 'opencode-form-input',
					attr: { 'aria-label': `${ids.title} (other values)`, 'aria-describedby': ids.describedBy } });
				custom.placeholder = 'Other values, separated by commas';
				custom.addEventListener('input', () => {
					this.values[key] = [...selected, ...custom.value.split(',').map((value) => value.trim()).filter(Boolean)];
				});
			}
			return group;
		}
		const input = label(control.createEl('input', { type: 'text', cls: 'opencode-form-input' }));
		input.disabled = true;
		return input;
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
			if (control.element.matches('input, select, textarea, [role="group"]')) {
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
