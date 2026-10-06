class MovieboxTui < Formula
  VERSION = "0.1.26"
  MACOS_SHA256 = "9693dfac12126c80962dd75fb100ab3c528588610ca9e4fc862778576d4dc97c"
  LINUX_X64_SHA256 = "1526c3193cade97d079df001a1a9929199e1d9c5d86a5f1ed366f60bcaeab345"
  LINUX_ARM64_SHA256 = "8fc5e05b46e4472ba486a03fd24d07144bac2ab17ada420d7abec0bd04da4bab"

  desc "Stream movies, shows, anime, and live TV from your terminal"
  homepage "https://github.com/mesamirh/MovieBox-Tui"
  version VERSION
  license any_of: ["MIT", "Apache-2.0"]

  on_macos do
    url "https://github.com/mesamirh/MovieBox-Tui/releases/download/v#{VERSION}/MovieBox_macOS_Universal.tar.gz"
    sha256 MACOS_SHA256
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/mesamirh/MovieBox-Tui/releases/download/v#{VERSION}/MovieBox_Linux_arm64.tar.gz"
      sha256 LINUX_ARM64_SHA256
    else
      url "https://github.com/mesamirh/MovieBox-Tui/releases/download/v#{VERSION}/MovieBox_Linux_x64.tar.gz"
      sha256 LINUX_X64_SHA256
    end
  end

  def install
    bin.install "moviebox-tui"
  end

  test do
    system "#{bin}/moviebox-tui", "--version"
  end
end
