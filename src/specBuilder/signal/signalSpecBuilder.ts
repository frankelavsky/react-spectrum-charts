/*
 * Copyright 2023 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { FILTERED_TABLE, HIGHLIGHTED_GROUP, HIGHLIGHTED_ITEM, HIGHLIGHTED_SERIES, SERIES_ID } from '@constants';
import { Signal } from 'vega';

/**
 * Does signal with given name exist?
 */
export const hasSignalByName = (signals: Signal[], name: string) => {
	return signals.some((signal) => signal.name === name);
};

/**
 *  Returns a controlled hover signal.
 *  Controlled hover signals get manually updated via the view in Chart.tsx
 */
export const getControlledHoveredIdSignal = (name: string): Signal => {
	return {
		name: `${name}_controlledHoveredId`,
		value: null,
		on: [{ events: `@${name}:mouseout`, update: 'null' }],
	};
};

/**
 *  Returns a controlled hover signal.
 *  Controlled hover signals get manually updated via the view in Chart.tsx
 */
export const getControlledHoveredGroupSignal = (name: string): Signal => {
	return {
		name: `${name}_controlledHoveredGroup`,
		value: null,
		on: [{ events: `@${name}:mouseout`, update: 'null' }],
	};
};

/**
 * Returns the highlighted series signal
 */
export const addHighlighSignalLegendHoverEvents = (
	signals: Signal[],
	legendName: string,
	includeHiddenSeries: boolean,
	keys?: string[]
) => {
	const signalName = keys?.length ? HIGHLIGHTED_GROUP : HIGHLIGHTED_SERIES;
	const highlightedItemSignal = signals.find((signal) => signal.name === signalName);
	if (highlightedItemSignal) {
		if (highlightedItemSignal.on === undefined) {
			highlightedItemSignal.on = [];
		}
		highlightedItemSignal.on.push(
			...[
				{
					events: `@${legendName}_legendEntry:mouseover`,
					update: getHighlightSignalUpdateExpression(legendName, includeHiddenSeries, keys),
				},
				{ events: `@${legendName}_legendEntry:mouseout`, update: 'null' },
			]
		);
	}
};

export const getHighlightSignalUpdateExpression = (
	legendName: string,
	includeHiddenSeries: boolean,
	keys?: string[]
) => {
	const hoveredSeriesExpression = `domain("${legendName}Entries")[datum.index]`;
	if (!includeHiddenSeries) return hoveredSeriesExpression;
	if (keys?.length) {
		return `indexof(pluck(data("${FILTERED_TABLE}"),"${legendName}_highlightGroupId"), ${hoveredSeriesExpression}) !== -1 ? ${hoveredSeriesExpression} : null`;
	}
	return `indexof(hiddenSeries, ${hoveredSeriesExpression}) === -1 ? ${hoveredSeriesExpression} : null`;
};

/**
 * Returns the legendLabels series signal
 */
export const getLegendLabelsSeriesSignal = (value: unknown = null): Signal => {
	return {
		name: 'legendLabels',
		value,
	};
};

/**
 * Returns a basic value based signal
 */
export const getGenericValueSignal = (name: string, value: unknown = null): Signal => {
	return { name, value };
};

/**
 * Returns a basic value based signal
 */
export const getGenericUpdateSignal = (name: string, update: string): Signal => {
	return { name, update };
};

/**
 * adds on events to the highlighted item signal
 * @param signals
 * @param markName
 * @param datumOrder how deep the datum is nested (i.e. 1 becomes datum.rscMarkId, 2 becomes datum.datum.rscMarkId, etc.)
 * @param excludeDataKey data items with a truthy value for this key will be excluded from the signal
 */
export const addHighlightedItemSignalEvents = (
	signals: Signal[],
	markName: string,
	idKey: string,
	datumOrder = 1,
	excludeDataKeys?: string[]
) => {
	const highlightedItemSignal = signals.find((signal) => signal.name === HIGHLIGHTED_ITEM);
	if (highlightedItemSignal) {
		if (highlightedItemSignal.on === undefined) {
			highlightedItemSignal.on = [];
		}
		const datum = new Array(datumOrder).fill('datum.').join('');

		const excludeDataKeysCondition = excludeDataKeys
			?.map((excludeDataKey) => `${datum}${excludeDataKey}`)
			.join(' || ');
		highlightedItemSignal.on.push(
			...[
				{
					events: `@${markName}:mouseover`,
					update: excludeDataKeys?.length
						? `(${excludeDataKeysCondition}) ? null : ${datum}${idKey}`
						: `${datum}${idKey}`,
				},
				{ events: `@${markName}:mouseout`, update: 'null' },
			]
		);
	}
};

/**
 * adds on events to the highlighted series signal
 * @param signals
 * @param markName
 * @param datumOrder how deep the datum is nested (i.e. 1 becomes datum.rscMarkId, 2 becomes datum.datum.rscMarkId, etc.)
 * @param excludeDataKey data items with a truthy value for this key will be excluded from the signal
 */
export const addHighlightedSeriesSignalEvents = (
	signals: Signal[],
	markName: string,
	datumOrder = 1,
	excludeDataKeys?: string[]
) => {
	const highlightedSeriesSignal = signals.find((signal) => signal.name === HIGHLIGHTED_SERIES);
	if (highlightedSeriesSignal) {
		if (highlightedSeriesSignal.on === undefined) {
			highlightedSeriesSignal.on = [];
		}
		const datum = new Array(datumOrder).fill('datum.').join('');

		const excludeDataKeysCondition = excludeDataKeys
			?.map((excludeDataKey) => `${datum}${excludeDataKey}`)
			.join(' || ');
		highlightedSeriesSignal.on.push(
			...[
				{
					events: `@${markName}:mouseover`,
					update: excludeDataKeys?.length
						? `(${excludeDataKeysCondition}) ? null : ${datum}${SERIES_ID}`
						: `${datum}${SERIES_ID}`,
				},
				{ events: `@${markName}:mouseout`, update: 'null' },
			]
		);
	}
};
