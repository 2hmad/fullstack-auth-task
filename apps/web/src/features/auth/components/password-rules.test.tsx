import { render, screen } from '@testing-library/react';
import { PasswordRules } from './password-rules';

describe('PasswordRules', () => {
  it('lists every requirement as missing for an empty password', () => {
    render(<PasswordRules password="" />);
    expect(screen.getAllByText('(missing)')).toHaveLength(4);
    expect(screen.getByText('0 of 4 password requirements met')).toBeInTheDocument();
  });

  it('marks requirements as they are met', () => {
    render(<PasswordRules password="abcdefgh" />);
    expect(screen.getByText('At least 8 characters')).toHaveTextContent('(done)');
    expect(screen.getByText('One letter')).toHaveTextContent('(done)');
    expect(screen.getByText('One number')).toHaveTextContent('(missing)');
    expect(screen.getByText('One special character')).toHaveTextContent('(missing)');
    expect(screen.getByText('2 of 4 password requirements met')).toBeInTheDocument();
  });

  it('is complete for a valid password', () => {
    render(<PasswordRules password="Analytical1!" />);
    expect(screen.getByText('4 of 4 password requirements met')).toBeInTheDocument();
  });
});
