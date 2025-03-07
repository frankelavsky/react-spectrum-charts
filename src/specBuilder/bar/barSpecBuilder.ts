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
import {
	COLOR_SCALE,
	DEFAULT_CATEGORICAL_DIMENSION,
	DEFAULT_COLOR_SCHEME,
	DEFAULT_METRIC,
	FILTERED_TABLE,
	LINE_TYPE_SCALE,
	OPACITY_SCALE,
	PADDING_RATIO,
	STACK_ID,
	TRELLIS_PADDING,
} from '@constants';
import { addPopoverData, getPopovers } from '@specBuilder/chartPopover/chartPopoverUtils';
import { addTooltipData, addTooltipSignals } from '@specBuilder/chartTooltip/chartTooltipUtils';
import { getTransformSort } from '@specBuilder/data/dataUtils';
import { getInteractiveMarkName } from '@specBuilder/line/lineUtils';
import { getTooltipProps } from '@specBuilder/marks/markUtils';
import {
	addDomainFields,
	addFieldToFacetScaleDomain,
	addMetricScale,
	getDefaultScale,
	getMetricScale,
	getScaleIndexByName,
	getScaleIndexByType,
} from '@specBuilder/scale/scaleSpecBuilder';
import { addHighlightedItemSignalEvents, getGenericValueSignal } from '@specBuilder/signal/signalSpecBuilder';
import { getColorValue, getFacetsFromProps } from '@specBuilder/specUtils';
import { addTrendlineData, getTrendlineMarks, setTrendlineSignals } from '@specBuilder/trendline';
import { sanitizeMarkChildren, toCamelCase } from '@utils';
import { produce } from 'immer';
import { BandScale, Data, FormulaTransform, Mark, OrdinalScale, Scale, Signal, Spec } from 'vega';

import { BarProps, BarSpecProps, ColorScheme, HighlightedItem } from '../../types';
import { getBarPadding, getDimensionSelectionRing, getScaleValues, isDodgedAndStacked } from './barUtils';
import { getDodgedMark } from './dodgedBarUtils';
import { getDodgedAndStackedBarMark, getStackedBarMarks } from './stackedBarUtils';
import { addTrellisScale, getTrellisGroupMark, isTrellised } from './trellisedBarUtils';

export const addBar = produce<
	Spec,
	[BarProps & { colorScheme?: ColorScheme; highlightedItem?: HighlightedItem; index?: number; idKey: string }]
>(
	(
		spec,
		{
			children,
			color = { value: 'categorical-100' },
			colorScheme = DEFAULT_COLOR_SCHEME,
			dimension = DEFAULT_CATEGORICAL_DIMENSION,
			hasSquareCorners = false,
			index = 0,
			lineType = { value: 'solid' },
			lineWidth = 0,
			metric = DEFAULT_METRIC,
			metricAxis,
			name,
			opacity = { value: 1 },
			orientation = 'vertical',
			paddingRatio = PADDING_RATIO,
			trellisOrientation = 'horizontal',
			trellisPadding = TRELLIS_PADDING,
			type = 'stacked',
			...props
		}
	) => {
		const sanitizedChildren = sanitizeMarkChildren(children);
		const barName = toCamelCase(name || `bar${index}`);
		// put props back together now that all defaults are set
		const barProps: BarSpecProps = {
			children: sanitizedChildren,
			dimensionScaleType: 'band',
			orientation,
			color,
			colorScheme,
			dimension,
			hasSquareCorners,
			index,
			interactiveMarkName: getInteractiveMarkName(sanitizedChildren, barName, props.highlightedItem),
			lineType,
			lineWidth,
			markType: 'bar',
			metric,
			metricAxis,
			name: barName,
			opacity,
			paddingRatio,
			trellisOrientation,
			trellisPadding,
			type,
			...props,
		};

		spec.data = addData(spec.data ?? [], barProps);
		spec.signals = addSignals(spec.signals ?? [], barProps);
		spec.scales = addScales(spec.scales ?? [], barProps);
		spec.marks = addMarks(spec.marks ?? [], barProps);
	}
);

export const addSignals = produce<Signal[], [BarSpecProps]>((signals, props) => {
	const { children, idKey, name, paddingRatio, paddingOuter: barPaddingOuter } = props;
	// We use this value to calculate ReferenceLine positions.
	const { paddingInner } = getBarPadding(paddingRatio, barPaddingOuter);
	signals.push(getGenericValueSignal('paddingInner', paddingInner));
	signals.push(getGenericValueSignal('focusedItem'));
	signals.push(getGenericValueSignal('focusedDimension'));
	signals.push(getGenericValueSignal('focusedRegion'));

	if (!children.length) {
		return;
	}
	addHighlightedItemSignalEvents(signals, name, idKey, 1, getTooltipProps(children)?.excludeDataKeys);
	addTooltipSignals(signals, props);
	setTrendlineSignals(signals, props);
});

export const addData = produce<Data[], [BarSpecProps]>((data, props) => {
	const { metric, order, type } = props;
	const index = data.findIndex((d) => d.name === FILTERED_TABLE);
	data[index].transform = data[index].transform ?? [];
	if (type === 'stacked' || isDodgedAndStacked(props)) {
		data[index].transform?.push({
			type: 'stack',
			groupby: getStackFields(props),
			field: metric,
			sort: getTransformSort(order),
			as: [`${metric}0`, `${metric}1`],
		});

		data[index].transform?.push(getStackIdTransform(props));
		data.push(getStackAggregateData(props));
	}
	if (type === 'dodged' || isDodgedAndStacked(props)) {
		data[index].transform?.push(getDodgeGroupTransform(props));
	}
	addTrendlineData(data, props);
	addTooltipData(data, props);
	addPopoverData(data, props);
});

/**
 * data aggregate used to calculate the min and max of the stack
 * used to figure out the corner radius of the bars
 * @param facets
 * @param barSpecProps
 * @returns vega Data object
 */
export const getStackAggregateData = (props: BarSpecProps): Data => {
	const { metric, name } = props;
	return {
		name: `${name}_stacks`,
		source: FILTERED_TABLE,
		transform: [
			{
				type: 'aggregate',
				groupby: getStackFields(props),
				fields: [`${metric}1`, `${metric}1`],
				ops: ['min', 'max'],
			},
			getStackIdTransform(props),
		],
	};
};

export const getStackIdTransform = (props: BarSpecProps): FormulaTransform => {
	return {
		type: 'formula',
		as: STACK_ID,
		expr: getStackFields(props)
			.map((facet) => `datum.${facet}`)
			.join(' + "," + '),
	};
};

const getStackFields = ({ trellis, color, dimension, lineType, opacity, type }: BarSpecProps): string[] => {
	const { facets, secondaryFacets } = getFacetsFromProps({ color, lineType, opacity });
	return [
		...(trellis ? [trellis] : []),
		dimension,
		...(type === 'dodged' ? facets : []),
		...(type === 'stacked' ? secondaryFacets : []),
	];
};

export const getDodgeGroupTransform = ({ color, lineType, name, opacity, type }: BarSpecProps): FormulaTransform => {
	const { facets, secondaryFacets } = getFacetsFromProps({ color, lineType, opacity });
	return {
		type: 'formula',
		as: `${name}_dodgeGroup`,
		expr: (type === 'dodged' ? facets : secondaryFacets).map((facet) => `datum.${facet}`).join(' + "," + '),
	};
};

export const addScales = produce<Scale[], [BarSpecProps]>((scales, props) => {
	const { color, lineType, opacity, orientation, metricAxis } = props;
	const axisType = orientation === 'vertical' ? 'y' : 'x';
	addMetricScale(scales, getScaleValues(props), axisType);
	if (metricAxis) {
		addMetricScale(scales, getScaleValues(props), axisType, metricAxis);
	}
	addDimensionScale(scales, props);
	addTrellisScale(scales, props);
	addFieldToFacetScaleDomain(scales, COLOR_SCALE, color);
	addFieldToFacetScaleDomain(scales, LINE_TYPE_SCALE, lineType);
	addFieldToFacetScaleDomain(scales, OPACITY_SCALE, opacity);
	addSecondaryScales(scales, props);
});

export const addDimensionScale = (
	scales: Scale[],
	{ dimension, paddingRatio, paddingOuter: barPaddingOuter, orientation }: BarSpecProps
) => {
	const index = getScaleIndexByType(scales, 'band', orientation === 'vertical' ? 'x' : 'y');
	scales[index] = addDomainFields(scales[index], [dimension]);
	const { paddingInner, paddingOuter } = getBarPadding(paddingRatio, barPaddingOuter);

	scales[index] = { ...scales[index], paddingInner, paddingOuter } as BandScale;
};

/**
 * adds scales for the secondary dimensions
 * If a bar is stacked and dodged,
 * @param scales
 * @param param1
 */
export const addSecondaryScales = (scales: Scale[], props: BarSpecProps) => {
	const { color, lineType, opacity } = props;
	if (isDodgedAndStacked(props)) {
		[
			{
				value: color,
				scaleName: 'colors',
				secondaryScaleName: 'secondaryColor',
			},
			{
				value: lineType,
				scaleName: 'lineTypes',
				secondaryScaleName: 'secondaryLineType',
			},
			{
				value: opacity,
				scaleName: 'opacities',
				secondaryScaleName: 'secondaryOpacity',
			},
		].forEach(({ value, scaleName, secondaryScaleName }) => {
			if (Array.isArray(value) && value.length === 2) {
				// secondary value scale used for 2D scales
				const secondaryIndex = getScaleIndexByName(scales, secondaryScaleName, 'ordinal');
				scales[secondaryIndex] = addDomainFields(scales[secondaryIndex], [value[1]]);

				const primaryIndex = getScaleIndexByName(scales, scaleName, 'ordinal');
				const primaryScale = scales[primaryIndex] as OrdinalScale;
				primaryScale.range = { signal: scaleName };
				scales[primaryIndex] = addDomainFields(primaryScale, [value[0]]);
			}
		});
	}
};

export const addMarks = produce<Mark[], [BarSpecProps]>((marks, props) => {
	const barMarks: Mark[] = [];
	if (isDodgedAndStacked(props)) {
		barMarks.push(getDodgedAndStackedBarMark(props));
	} else if (props.type === 'stacked') {
		barMarks.push(...getStackedBarMarks(props));
	} else {
		barMarks.push(...getDodgedMark(props));
	}

	const popovers = getPopovers(props);
	if (popovers.some((popover) => popover.UNSAFE_highlightBy === 'dimension')) {
		barMarks.push(getDimensionSelectionRing(props));
	}

	// if this is a trellis plot, we add the bars and the repeated scale to the trellis group
	if (isTrellised(props)) {
		const repeatedScale = getRepeatedScale(props);
		marks.push(getTrellisGroupMark(props, barMarks, repeatedScale));
	} else {
		marks.push(...barMarks);
	}

	marks.push(...getTrendlineMarks(props));
	marks.push({
		name: 'chartFocusRing',
		type: 'rect',
		interactive: false,
		encode: {
			enter: {
				strokeWidth: { value: 2 },
				fill: { value: 'transparent' },
				stroke: { value: getColorValue('static-blue', props.colorScheme) },
				cornerRadius: { value: 4 },
			},
			update: {
				x: { value: 0 },
				x2: { signal: 'width' },
				y: { value: 0 },
				y2: { signal: 'height' },
				opacity: [{ test: "focusedRegion === 'chart'", value: 1 }, { value: 0 }],
			},
		},
	});
});

export const getRepeatedScale = (props: BarSpecProps): Scale => {
	const { orientation, trellisOrientation } = props;
	// if the orientations match then the metric scale is repeated, otherwise the dimension scale is repeated
	// ex. vertical bar in a vertical trellis will have multiple copies of the metric scale
	if (orientation === trellisOrientation) {
		return getMetricScale(getScaleValues(props), orientation === 'vertical' ? 'y' : 'x', orientation);
	} else {
		return getDimensionScale(props);
	}
};

/**
 * Generates a dimension scale and returns it
 * NOTE: does not check if the dimension scale already exists
 * @param param0
 * @returns
 */
const getDimensionScale = ({
	dimension,
	orientation,
	paddingRatio,
	paddingOuter: barPaddingOuter,
}: BarSpecProps): BandScale => {
	let scale = getDefaultScale('band', orientation === 'vertical' ? 'x' : 'y', orientation);
	scale = addDomainFields(scale, [dimension]);
	const { paddingInner, paddingOuter } = getBarPadding(paddingRatio, barPaddingOuter);
	return { ...scale, paddingInner, paddingOuter } as BandScale;
};
