import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const GlassCard: React.FC<{ children: React.ReactNode, className?: string, glow?: 'blue' | 'purple' | 'red' }> = ({ children, className, glow }) => (
  <div className={cn(
    "glass rounded-2xl p-6 transition-all duration-300",
    glow === 'blue' && "glow-blue",
    glow === 'purple' && "glow-purple",
    glow === 'red' && "glow-red",
    className
  )}>
    {children}
  </div>
);

export const Badge: React.FC<{ children: React.ReactNode, variant?: 'default' | 'warning' | 'error' | 'success' }> = ({ children, variant = 'default' }) => {
  const variants = {
    default: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    error: "bg-red-500/20 text-red-400 border-red-500/30",
    success: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wider", variants[variant])}>
      {children}
    </span>
  );
};
