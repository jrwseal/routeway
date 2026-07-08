import React from 'react';

const routewayLogoUrl = new URL('../assets/routeway-logo.png', import.meta.url).href;

interface AppLogoProps {
  className?: string;
  imageClassName?: string;
}

export default function AppLogo({ className = '', imageClassName = '' }: AppLogoProps) {
  return (
    <div className={className}>
      <img
        src={routewayLogoUrl}
        alt="RouteWay Intelligence"
        className={`block h-auto w-full object-contain ${imageClassName}`}
      />
    </div>
  );
}
