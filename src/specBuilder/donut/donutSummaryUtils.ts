/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { DonutSummary } from '@rsc/alpha';
import { DONUT_RADIUS, DONUT_SUMMARY_MIN_RADIUS } from '@constants';
import { getTextNumberFormat } from '@specBuilder/textUtils';
import { EncodeEntryName, GroupMark, Mark, ProductionRule, TextEncodeEntry, TextValueRef } from 'vega';

import { DonutSpecProps, DonutSummaryElement, DonutSummaryProps, DonutSummarySpecProps } from '../../types';

/**
 * Gets the DonutSummary component from the children if one exists
 * @param donutProps
 * @returns 
 */
const getDonutSummary = (props: DonutSpecProps): DonutSummarySpecProps | undefined => {
	const donutSummary = props.children.find((child) => child.type === DonutSummary) as DonutSummaryElement;
	if (!donutSummary) {
		return;
	}
	return applyDonutSummaryPropDefaults(donutSummary.props, props);
};

/**
 * Applies all default props, converting donutSummaryProps into donutSummarySpecProps
 * @param donutSummaryProps 
 * @param donutProps 
 * @returns 
 */
const applyDonutSummaryPropDefaults = (
	{ numberFormat = 'shortNumber', ...props }: DonutSummaryProps,
	donutProps: DonutSpecProps
): DonutSummarySpecProps => ({
	donutProps,
	numberFormat,
	...props,
});

/**
 * Gets all the marks for the donut summary
 * @param donutProps 
 * @returns GroupMark[]
 */
export const getDonutSummaryMarks = (props: DonutSpecProps): GroupMark[] => {
	const donutSummary = getDonutSummary(props);
	if (!donutSummary) {
		return [];
	}
	const { donutProps } = donutSummary;
	const marks: GroupMark[] = [];
	if (donutProps.isBoolean) {
		marks.push(getBooleanDonutSummaryGroupMark(donutSummary));
	} else {
		marks.push(getDonutSummaryGroupMark(donutSummary));
	}
	return marks;
};

/**
 * Gets the group mark for the donut summary
 * @param donutSummaryProps
 * @returns GorupMark
 */
export const getDonutSummaryGroupMark = (props: DonutSummarySpecProps): GroupMark => {
	const { donutProps, label } = props;
	const groupMark: Mark = {
		type: 'group',
		name: `${donutProps.name}_summaryGroup`,
		marks: [
			{
				type: 'text',
				name: `${donutProps.name}_summaryValue`,
				from: { data: `${donutProps.name}_summaryData` },
				encode: getSummaryValueEncode(props),
			},
		],
	};
	if (label) {
		groupMark.marks?.push({
			type: 'text',
			name: `${donutProps.name}_summaryLabel`,
			from: { data: `${donutProps.name}_summaryData` },
			encode: getSummaryLabelEncode({ ...props, label }),
		});
	}
	return groupMark;
};

/**
 * Gets the group mark for a boolean donut summary
 * @param donutSummaryProps
 * @returns GroupMark
 */
export const getBooleanDonutSummaryGroupMark = (props: DonutSummarySpecProps): GroupMark => {
	const { donutProps, label } = props;
	const groupMark: Mark = {
		type: 'group',
		name: `${donutProps.name}_percentText`,
		marks: [
			{
				type: 'text',
				name: `${donutProps.name}_booleanSummaryValue`,
				from: { data: `${donutProps.name}_booleanData` },
				encode: getSummaryValueEncode(props),
			},
		],
	};
	if (label) {
		
		groupMark.marks?.push({
			type: 'text',
			name: `${donutProps.name}_booleanSummaryLabel`,
			from: { data: `${donutProps.name}_booleanData` },
			encode: getSummaryLabelEncode({ ...props, label }),
		});
	}
	return groupMark;
};

/**
 * Gets the encode for the summary value
 * @param donutSummaryProps
 * @returns encode
 */
const getSummaryValueEncode = (
	props: DonutSummarySpecProps
): Partial<Record<EncodeEntryName, TextEncodeEntry>> => {
	const { donutProps } = props;
	return {
		update: {
			x: { signal: 'width / 2' },
			y: { signal: 'height / 2' },
			text: getSummaryValueText(props),
			fontSize: { signal: `${donutProps.name}_summaryFontSize` },
			align: { value: 'center' },
			baseline: { value: 'alphabetic' },
			fillOpacity: [
				{ test: `${DONUT_RADIUS} * ${donutProps.holeRatio} < ${DONUT_SUMMARY_MIN_RADIUS}`, value: 0 },
			],
			limit: {
				signal: `2 * sqrt(pow(${DONUT_RADIUS} * ${donutProps.holeRatio}, 2) - pow(${donutProps.name}_summaryFontSize, 2))`,
			},
		},
	};
};

/**
 * Gets the text value for the summary value
 * @param donutSummaryProps
 * @returns TextValueref
 */
export const getSummaryValueText = ({
	donutProps,
	numberFormat,
}: DonutSummarySpecProps): ProductionRule<TextValueRef> => {
	if (donutProps.isBoolean) {
		return { signal: `format(datum['${donutProps.metric}'], '.0%')` };
	}
	return [...getTextNumberFormat(numberFormat, 'sum'), { field: 'sum' }];
};

/**
 * Gets the encode for the metric label
 * @param donutSummaryProps
 * @returns encode
 */
export const getSummaryLabelEncode = ({
	donutProps,
	label,
}: DonutSummarySpecProps & { label: string }): Partial<Record<EncodeEntryName, TextEncodeEntry>> => {
	return {
		update: {
			x: { signal: 'width / 2' },
			y: { signal: 'height / 2' },
			dy: { signal: `ceil(${donutProps.name}_summaryFontSize * 0.25)` },
			text: { value: label },
			fontSize: { signal: `ceil(${donutProps.name}_summaryFontSize * 0.5)` },
			align: { value: 'center' },
			baseline: { value: 'top' },
			fillOpacity: [
				{ test: `${DONUT_RADIUS} * ${donutProps.holeRatio} < ${DONUT_SUMMARY_MIN_RADIUS}`, value: 0 },
			],
			limit: {
				signal: `2 * sqrt(pow(${DONUT_RADIUS} * ${donutProps.holeRatio}, 2) - pow(${donutProps.name}_summaryFontSize * 0.75, 2))`,
			},
		},
	};
};
