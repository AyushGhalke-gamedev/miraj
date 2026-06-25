const tabButtons = document.querySelectorAll("[data-tab]");
const tabPanels = document.querySelectorAll("[data-tab-panel]");

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    const tab = button.dataset.tab;

    for (const item of tabButtons) {
      item.classList.toggle("active", item === button);
    }

    for (const panel of tabPanels) {
      panel.classList.toggle("active", panel.dataset.tabPanel === tab);
    }
  });
}
