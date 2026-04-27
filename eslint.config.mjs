import nextVitals from "eslint-config-next/core-web-vitals.js";
import nextTypescript from "eslint-config-next/typescript.js";

const eslintConfig = [...nextVitals, ...nextTypescript];

export default eslintConfig;
