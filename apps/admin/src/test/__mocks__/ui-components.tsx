import React from 'react';

// Mock Card components
export const Card = ({
  children,
  className,
  onClick
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void
}) => (
  <div className={`${className || ''} cursor-pointer`} onClick={onClick} data-testid="card">
    {children}
  </div>
);

export const CardHeader = ({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string
}) => (
  <div className={className} data-testid="card-header">
    {children}
  </div>
);

export const CardTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 data-testid="card-title">{children}</h3>
);

export const CardContent = ({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string
}) => (
  <div className={className} data-testid="card-content">
    {children}
  </div>
);

// Mock Button component
export const Button = ({
  children,
  onClick,
  disabled,
  className
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string
}) => (
  <button onClick={onClick} disabled={disabled} className={className}>
    {children}
  </button>
);

// Export default for wildcard imports
export default {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
};
