export function triggerDownload(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  document.body.removeChild(link);
}
