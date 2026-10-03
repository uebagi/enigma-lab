package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"enigma/bombe"
	"enigma/enigma"
)

func TestEncodeAndContinue(t *testing.T) {
	h := NewHandler()
	c := enigma.M3()
	var output string
	for _, text := range []string{"AA", "AAA"} {
		body, _ := json.Marshal(Request{c, text})
		r := httptest.NewRequest(http.MethodPost, "/api/encode", bytes.NewReader(body))
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 200 {
			t.Fatalf("%d %s", w.Code, w.Body.String())
		}
		var response Response
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		output += response.Output
		c = response.Config
	}
	if output != "BDZGO" || c.Rotors[2].Position != "F" {
		t.Fatalf("%s %+v", output, c)
	}
}

func TestHTTPValidation(t *testing.T) {
	h := NewHandler()
	for _, body := range []string{`{`, `null`, `{}`, `{"config":{},"text":"A","unexpected":1}`, `{} {}`, `{"config":{"rotors":[{"name":"I","position":"A","ring":1}],"reflector":"B","plugboard":[]},"text":"a"}`, strings.Repeat(" ", 1<<20) + "{}"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("POST", "/api/encode", strings.NewReader(body)))
		if w.Code != 400 {
			t.Fatalf("invalid request returned %d", w.Code)
		}
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/api/encode", nil))
	if w.Code != 405 {
		t.Fatalf("wrong method returned %d", w.Code)
	}
}

func TestAssetsAndCatalog(t *testing.T) {
	h := NewHandler()
	for _, path := range []string{"/", "/app.js", "/style.css", "/settings-url.js", "/enigma-engine.js", "/bombe-engine.js", "/bombe-worker.js", "/bombe-client.js", "/api/catalog", "/bombe", "/bombe.js", "/bombe.css"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 || w.Body.Len() == 0 {
			t.Fatalf("%s: %d", path, w.Code)
		}
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/missing", nil))
	if w.Code != 404 {
		t.Fatalf("unknown asset returned %d", w.Code)
	}
}

func TestBombeEndpoint(t *testing.T) {
	r := bombe.Request{Ciphertext: "ILBDAAMTAZ", Crib: "HELLOWORLD", Rotors: []string{"I", "II", "III"}, Rings: []int{1, 1, 1}, Reflector: "B", KnownPlugboard: true, MaxPairs: 10, Limit: 1}
	body, _ := json.Marshal(r)
	w := httptest.NewRecorder()
	NewHandler().ServeHTTP(w, httptest.NewRequest("POST", "/api/bombe/search", bytes.NewReader(body)))
	var result bombe.Result
	if w.Code != 200 {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Candidates) != 1 || result.Candidates[0].Plaintext != "HELLOWORLD" {
		t.Fatal("known settings not recovered")
	}
	w = httptest.NewRecorder()
	NewHandler().ServeHTTP(w, httptest.NewRequest("POST", "/api/bombe/search", strings.NewReader(`{"unexpected":true}`)))
	if w.Code != 400 {
		t.Fatal("unknown search field accepted")
	}
}
