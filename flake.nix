{
  description = "Nodejs 22";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = import nixpkgs {inherit system;};
      in {
        devShells = {
          default = pkgs.mkShell rec {
            packages = with pkgs; [
              nodePackages.nodejs
              nodePackages.typescript
              nodePackages.typescript-language-server
              nodePackages.pnpm
              
              # Dependencies for @discordjs/opus
              python3
              ffmpeg
            ];
          };
        };
      }
    );
}
