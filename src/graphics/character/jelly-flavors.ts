export type JellyFlavor = {
  readonly surface:string;
  readonly absorption:readonly [number,number,number];
};

export const JELLY_FLAVORS={
  lime:{surface:'#eaffd4',absorption:[48,3.2,85]},
  strawberry:{surface:'#ffc2ce',absorption:[10,44,56]},
  blueberry:{surface:'#a9d9ff',absorption:[14,8,3]},
  lemon:{surface:'#fff06a',absorption:[8,8,112]},
} as const satisfies Record<string,JellyFlavor>;

export type JellyFlavorName=keyof typeof JELLY_FLAVORS;
export const DEFAULT_JELLY_FLAVOR:JellyFlavorName='lime';
