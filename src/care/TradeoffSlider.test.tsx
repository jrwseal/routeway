import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TradeoffSlider from './TradeoffSlider';

describe('TradeoffSlider', () => {
  it('renders the trade-off labels and current weight', () => {
    const html = renderToStaticMarkup(<TradeoffSlider value={1.2} onChange={() => {}} />);

    expect(html).toContain('Cost-optimal');
    expect(html).toContain('Time-critical');
    expect(html).toContain('1.2');
  });
});
