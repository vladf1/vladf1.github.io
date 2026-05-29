import "./style.css";
import { Page } from "./Page";

const root = document.querySelector<HTMLElement>("#root");
if (root === null) {
  throw new Error("root element is missing.");
}

new Page(root);
