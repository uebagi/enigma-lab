package controller

import (
	"encoding/json"
	"io"
	"net/http"

	"enigma/bombe"
)

func searchBombe(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	defer r.Body.Close()
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	var request bombe.Request
	if err := d.Decode(&request); err != nil {
		respond(w, 400, map[string]string{"error": "invalid search request: " + err.Error()})
		return
	}
	if err := d.Decode(new(any)); err != io.EOF {
		respond(w, 400, map[string]string{"error": "request must contain one JSON object"})
		return
	}
	result, err := bombe.SearchChunk(r.Context(), request)
	if err != nil {
		respond(w, 400, map[string]string{"error": err.Error()})
		return
	}
	respond(w, 200, result)
}
