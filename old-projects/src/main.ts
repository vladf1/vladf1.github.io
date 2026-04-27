import "./style.css";
import { MainPage } from "./MainPage";

const canvas = document.querySelector<HTMLCanvasElement>("#rootCanvas");
if (canvas === null) {
  throw new Error("rootCanvas is missing.");
}

const context = canvas.getContext("2d");
if (context === null) {
  throw new Error("2D canvas is unavailable.");
}

new MainPage(canvas, context);
