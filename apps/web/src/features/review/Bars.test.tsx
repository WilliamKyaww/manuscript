import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Bars } from './Bars';

const days = (values: number[]) =>
  values.map((value, index) => ({ date: `2026-10-${String(10 + index)}`, value }));

describe('bars', () => {
  it('says why a chart is empty instead of showing a row of empty bars', () => {
    render(
      <Bars
        label="Due"
        days={days([0, 0, 0])}
        describe={(day) => `${day.value}`}
        empty="Nothing scheduled yet."
      />,
    );
    expect(screen.getByText('Nothing scheduled yet.')).toBeInTheDocument();
    // Each day is still listed for screen readers.
    expect(screen.getByRole('list', { name: 'Due' }).children).toHaveLength(3);
  });

  it('shows no message once a day has a value', () => {
    render(
      <Bars
        label="Due"
        days={days([0, 2, 0])}
        describe={(day) => `${day.value}`}
        empty="Nothing scheduled yet."
      />,
    );
    expect(screen.queryByText('Nothing scheduled yet.')).not.toBeInTheDocument();
  });
});
