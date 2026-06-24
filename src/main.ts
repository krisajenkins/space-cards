import { mount } from "svelte";
import "./app.css";
import Root from "./Root.svelte";
import { initAnalytics } from "./lib/analytics";

initAnalytics();

mount(Root, {
  target: document.getElementById("app")!,
});
