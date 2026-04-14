import React from 'react';

export const Fragment = React.Fragment;
export function jsx(type, props, key) {
  return React.createElement(type, { ...(props || {}), key });
}
export const jsxs = jsx;
