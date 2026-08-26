// v52.48.5.44.37 CSS zoom 환경의 Autocomplete 기준 좌표 보정
import React, { forwardRef, useMemo } from 'react';
import Popper from '@mui/material/Popper';

const readDashboardScale = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 1;
  const rootStyle = window.getComputedStyle(document.documentElement);
  const cssScale = Number.parseFloat(
    rootStyle.getPropertyValue('--wooklim-dashboard-scale'),
  );
  if (Number.isFinite(cssScale) && cssScale > 0) return cssScale;
  const zoom = Number.parseFloat(rootStyle.zoom);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
};

const createScaleAwareAnchor = (anchorElement) => ({
  contextElement: anchorElement,
  getBoundingClientRect: () => {
    const rect = anchorElement.getBoundingClientRect();
    const scale = readDashboardScale();
    const left = rect.left / scale;
    const top = rect.top / scale;
    const width = rect.width / scale;
    const height = rect.height / scale;
    return {
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON: () => ({}),
    };
  },
});

const ScaleAwareAutocompletePopper = forwardRef(
  function ScaleAwareAutocompletePopper({ anchorEl, className = '', ...props }, ref) {
    const resolvedAnchor = typeof anchorEl === 'function' ? anchorEl() : anchorEl;
    const scaleAwareAnchor = useMemo(
      () => (resolvedAnchor ? createScaleAwareAnchor(resolvedAnchor) : null),
      [resolvedAnchor],
    );

    return (
      <Popper
        {...props}
        ref={ref}
        anchorEl={scaleAwareAnchor}
        className={`${className} wooklim-scale-aware-autocomplete-popper`.trim()}
      />
    );
  },
);

export default ScaleAwareAutocompletePopper;
