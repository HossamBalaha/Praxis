const fs = require("fs");
const path = require("path");

function dereferenceDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.lstatSync(fullPath);

    if (stat.isSymbolicLink()) {
      const target = fs.realpathSync(fullPath);
      fs.unlinkSync(fullPath);
      fs.cpSync(target, fullPath, {recursive: true});
    } else if (stat.isDirectory()) {
      dereferenceDir(fullPath);
    }
  }
}

dereferenceDir(path.join(__dirname, "..", ".next", "standalone"));
console.log("Dereferenced standalone symlinks successfully.");
