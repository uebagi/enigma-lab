// Package controller exposes a stateless JSON HTTP interface to the emulator.
package controller

import (
	"encoding/json"
	"io"
	"net/http"

	"enigma/enigma"
	"enigma/web"
)

type Request struct {
	Config enigma.Config `json:"config"`
	Text   string        `json:"text"`
}

type Response struct {
	Output string         `json:"output"`
	Config enigma.Config  `json:"config"`
	Trace  []enigma.Stage `json:"trace"`
}

func respond(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func NewHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/bombe/search", searchBombe)
	mux.HandleFunc("GET /api/catalog", func(w http.ResponseWriter, r *http.Request) {
		respond(w, 200, map[string]any{"rotors": enigma.Catalog(), "reflectors": enigma.Reflectors(), "presets": map[string]enigma.Config{"M3": enigma.M3(), "M4": enigma.M4()}})
	})
	mux.HandleFunc("POST /api/encode", func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, err string) { respond(w, status, map[string]string{"error": err}) }
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		defer r.Body.Close()
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		var request Request
		if err := decoder.Decode(&request); err != nil {
			fail(400, "invalid JSON request: "+err.Error())
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			fail(400, "request must contain one JSON object")
			return
		}
		machine, err := enigma.New(request.Config)
		if err != nil {
			fail(400, err.Error())
			return
		}
		// Validate the entire message before processing any key.
		for i := range request.Text {
			if request.Text[i] < 'A' || request.Text[i] > 'Z' {
				fail(400, "text must contain only A-Z")
				return
			}
		}
		out := make([]byte, len(request.Text))
		var trace []enigma.Stage
		for i := range request.Text {
			out[i], trace, _ = machine.Press(request.Text[i])
		}
		respond(w, 200, Response{string(out), machine.Config(), trace})
	})
	assets := http.FileServer(http.FS(web.Assets))
	mux.Handle("GET /{$}", assets)
	mux.Handle("GET /app.js", assets)
	mux.Handle("GET /style.css", assets)
	mux.Handle("GET /settings-url.js", assets)
	mux.Handle("GET /enigma-engine.js", assets)
	mux.Handle("GET /bombe-engine.js", assets)
	mux.Handle("GET /bombe-worker.js", assets)
	mux.Handle("GET /bombe-client.js", assets)
	mux.HandleFunc("GET /bombe", func(w http.ResponseWriter, r *http.Request) {
		r.URL.Path = "/bombe.html"
		assets.ServeHTTP(w, r)
	})
	mux.Handle("GET /bombe.html", assets)
	mux.Handle("GET /bombe.js", assets)
	mux.Handle("GET /bombe.css", assets)
	return mux
}
