package web

import "embed"

//go:embed *.html *.js *.css
var Assets embed.FS
