package bombe

import (
	"context"
	"testing"

	"enigma/enigma"
)

func fixture(t *testing.T, windows string, plugs []string) (Request, enigma.Config) {
	t.Helper()
	c := enigma.M3()
	c.Plugboard = plugs
	for i := range c.Rotors {
		c.Rotors[i].Position = windows[i : i+1]
	}
	m, err := enigma.New(c)
	if err != nil {
		t.Fatal(err)
	}
	plain := "WETTERBERICHTFUERDENNORDATLANTIK"
	cipher, err := m.Encode(plain)
	if err != nil {
		t.Fatal(err)
	}
	return Request{Ciphertext: cipher, Crib: plain, Rotors: []string{"I", "II", "III"}, Rings: []int{1, 1, 1}, Reflector: "B", MaxPairs: 10, Limit: 32}, c
}

func index(windows string) int {
	return int(windows[0]-'A')*676 + int(windows[1]-'A')*26 + int(windows[2]-'A')
}

func TestRecoverUnknownPlugboard(t *testing.T) {
	r, _ := fixture(t, "AAF", []string{"AZ", "BY", "CX"})
	result, err := SearchChunk(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, candidate := range result.Candidates {
		if candidate.Config.Rotors[2].Position == "F" {
			found = true
			if candidate.Plaintext != r.Crib {
				t.Fatal("recovered candidate does not decrypt the crib")
			}
			if len(candidate.Config.Plugboard) == 0 {
				t.Fatal("unknown cables were not inferred")
			}
		}
	}
	if !found {
		t.Fatalf("expected AAF stop: %+v", result)
	}
	if result.Next != 32 || result.Tested != 32 {
		t.Fatalf("bad cursor: %+v", result)
	}
	if result.Rejected+result.Unresolved+len(result.Candidates) != result.Tested {
		t.Fatal("accounting mismatch")
	}
}

func TestOffsetDoubleSteppingAndRings(t *testing.T) {
	c := enigma.M3()
	c.Rotors[1].Position = "D"
	c.Rotors[2].Position = "U"
	c.Rotors[0].Ring = 7
	c.Rotors[1].Ring = 12
	c.Plugboard = []string{"AZ", "BY"}
	plain := "AAAAAWETTERBERICHTFUERDENNORDATLANTIK"
	m, _ := enigma.New(c)
	cipher, _ := m.Encode(plain)
	r := Request{Ciphertext: cipher, Crib: plain[5:], Offset: 5, Rotors: []string{"I", "II", "III"}, Rings: []int{7, 12, 1}, Reflector: "B", KnownPlugboard: true, Plugboard: c.Plugboard, MaxPairs: 10, Cursor: index("ADU"), Limit: 1}
	result, err := SearchChunk(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Candidates) != 1 || result.Candidates[0].Plaintext != plain {
		t.Fatalf("offset/double-step mismatch: %+v", result)
	}
}

func TestOrderPermutationAndResume(t *testing.T) {
	r, c := fixture(t, "AAF", nil)
	c.Rotors[0].Name = "III"
	c.Rotors[2].Name = "I"
	m, _ := enigma.New(c)
	r.Ciphertext, _ = m.Encode(r.Crib)
	r.KnownPlugboard = true
	r.Permute = true
	r.Cursor = 5*Positions + 5
	r.Limit = 1
	result, err := SearchChunk(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Candidates) != 1 || result.Candidates[0].Config.Rotors[0].Name != "III" || result.Next != r.Cursor+1 || result.Total != 6*Positions {
		t.Fatalf("bad permutation/cursor: %+v", result)
	}
	r.Cursor = result.Total
	r.Limit = 1
	result, err = SearchChunk(context.Background(), r)
	if err != nil || !result.Done || result.Tested != 0 {
		t.Fatal("completed cursor was not handled")
	}
}

func TestRejectImpossibleAlignment(t *testing.T) {
	r, _ := fixture(t, "AAA", nil)
	r.Crib = r.Ciphertext[:10]
	result, err := SearchChunk(context.Background(), r)
	if err != nil || !result.Done || result.Tested != 0 || result.Rejected != Positions || len(result.Candidates) != 0 {
		t.Fatalf("self-match not rejected: %+v %v", result, err)
	}
}

func TestValidationAndCancellation(t *testing.T) {
	for _, change := range []func(*Request){
		func(r *Request) { r.Crib = "ABC" }, func(r *Request) { r.Offset = -1 }, func(r *Request) { r.Offset = 500 },
		func(r *Request) { r.Rotors[1] = "I" }, func(r *Request) { r.Rotors[0] = "Beta" }, func(r *Request) { r.Rings[1] = 0 },
		func(r *Request) { r.Plugboard = []string{"AZ"} }, func(r *Request) { r.MaxPairs = 14 }, func(r *Request) { r.Limit = 257 },
		func(r *Request) { r.Cursor = -1 }, func(r *Request) { r.Ciphertext = "abcdef" }, func(r *Request) { r.Reflector = "B-thin" },
	} {
		r, _ := fixture(t, "AAF", nil)
		change(&r)
		if Validate(r) == nil {
			t.Fatal("invalid request accepted")
		}
	}
	r, _ := fixture(t, "AAF", nil)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := SearchChunk(ctx, r); err != context.Canceled {
		t.Fatalf("expected cancellation, got %v", err)
	}
}

func TestContradictionsAndNodeBudget(t *testing.T) {
	var mapping [26]int
	for i := range mapping {
		mapping[i] = -1
	}
	if !bind(&mapping, 0, 1) || bind(&mapping, 0, 2) || mapping[1] != 0 {
		t.Fatal("reciprocal binding failed")
	}
	s := solver{ctx: context.Background(), nodes: NodeLimit}
	if _, ok := s.solve(mapping); ok || !s.limited {
		t.Fatal("exhausted budget claimed a resolved solution")
	}
}
