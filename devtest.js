const { desktopCapturer } = require("electron");

async function test() {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1000, height: 1000 }
  });

  console.log("SOURCES:", sources);
}

test();
