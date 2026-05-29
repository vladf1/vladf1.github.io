import "./style.css";
import { MainPage } from "./MainPage";

const root = document.querySelector<HTMLElement>("#root");
if (root === null) {
  throw new Error("root element is missing.");
}

new MainPage(root);
