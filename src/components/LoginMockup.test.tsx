import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LoginMockup from './LoginMockup';

describe('LoginMockup', () => {
  it('renders the RouteWay login controls', () => {
    const html = renderToStaticMarkup(<LoginMockup onSignIn={() => {}} />);

    expect(html).toContain('RouteWay Intelligence');
    expect(html).toContain('Email address');
    expect(html).toContain('Password');
    expect(html).toContain('Sign in');
    expect(html).toContain('Use demo mode');
    expect(html).toContain('Try RouteWay Care');
    expect(html).toContain('?care=1');
    expect(html).not.toContain('Fleet operations portal');
    expect(html).not.toContain("Today's control status");
  });
});
