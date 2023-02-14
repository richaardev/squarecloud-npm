const fs = require("fs");
const path = require("path");
const axios = require("axios");
const unzipper = require("unzipper");
const AdmZip = require("adm-zip");
const { stdout } = require("process");
const tar = require("tar-fs");
const zlib = require("zlib");

const ARCH_MAPPING = {
  ia32: "386",
  x64: "amd64",
  arm: "arm",
};

const PLATFORM_MAPPING = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
  freebsd: "freebsd",
};

const PLATFORM = PLATFORM_MAPPING[process.platform];
const UNSUPPORTED_PLATFORM = new Error("Unsupported Platform: " + PLATFORM);

const ARCH = ARCH_MAPPING[process.arch];
const UNSUPPORTED_ARCH = new Error("Unsupported Arch: " + ARCH);

const package = require(path.resolve(__dirname, "package.json"));

async function getCurrentRelease() {
  let res = await axios.get(
    "https://api.github.com/repos/" + package.go_binary.repo + "/releases/latest",
    {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Square Cloud CLI",
      },
    },
  );

  return res.data;
}

async function extractFile(path) {
  return new Promise(async (resolve, reject) => {
    if (path.endsWith(".zip")) {
      let extract = unzipper.Extract({ path: "./bin" });
      extract.on("end", () => {
        resolve(true);
      });
      
      fs.createReadStream(path).pipe(extract);
    } else if (path.endsWith(".tar.gz")) {
      let extract = tar.extract("./bin");
      extract.on("end", () => {
        resolve(true);
      });

      fs.createReadStream(path).pipe(zlib.createGunzip()).pipe(extract);
    }

    resolve(false);
  });
}

async function installBinaries() {
  if (!PLATFORM) throw UNSUPPORTED_PLATFORM;
  if (!ARCH) throw UNSUPPORTED_ARCH;

  let release = await getCurrentRelease();
  let regex = new RegExp(`${package.go_binary.name}_([0-9]\.){2}([0-9])_${PLATFORM}_${ARCH}`);
  let asset = release.assets.filter((a) => regex.test(a.name))[0];
  if (!asset) throw new Error(`Cannot find an asset for ${PLATFORM} - ${ARCH}`);

  try {
    const res = await axios({
      method: "get",
      url: asset.browser_download_url,
      responseType: "stream",
    });

    let filepath = path.resolve(__dirname, "./bin", asset.name);
    let stream = fs.createWriteStream(filepath);
    stream.on("close", () => {
      extractFile(filepath).then(() => {
        fs.unlinkSync(filepath)
      });
    });

    res.data.pipe(stream);
  } catch (err) {
    console.log("Error when trying to download and extract the file", err);
  }
}

(() => {
  let argv = process.argv;
  if (argv[2] === "update") {
    installBinaries();
    return;
  }

  const { execFileSync } = require("child_process");
  const binDir = path.resolve(__dirname, "./bin");
  const execfile = path.resolve(binDir, "squarecloud");

  stdout.write(execFileSync(execfile, argv.slice(2)));
})();
