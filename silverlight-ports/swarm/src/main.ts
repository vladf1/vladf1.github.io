import "./style.css";
import { App } from "./App";

const root = document.querySelector<HTMLElement>("#root");
if (root === null) {
  throw new Error("root element is missing.");
}

new App(root);
