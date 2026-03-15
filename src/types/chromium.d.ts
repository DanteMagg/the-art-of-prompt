declare module "@sparticuz/chromium-min" {
  const chromium: {
    executablePath: () => Promise<string>;
    args: string[];
    headless: boolean | "new";
  };
  export default chromium;
}
