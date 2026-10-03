// Package bombe provides an educational crib/menu constraint search. It models
// reciprocal stecker propagation, not the physical wiring or timing of a Bombe.
package bombe

import (
	"context"
	"fmt"
	"time"

	"enigma/enigma"
)

const Positions = 26 * 26 * 26
const NodeLimit = 2000

type Request struct {
	Ciphertext     string   `json:"ciphertext"`
	Crib           string   `json:"crib"`
	Offset         int      `json:"offset"` // Zero-based alignment in normalized ciphertext.
	Rotors         []string `json:"rotors"`
	Rings          []int    `json:"rings"` // Fixed by slot, even when orders are permuted.
	Reflector      string   `json:"reflector"`
	Permute        bool     `json:"permute"`
	KnownPlugboard bool     `json:"known_plugboard"`
	Plugboard      []string `json:"plugboard"`
	MaxPairs       int      `json:"max_pairs"`
	Cursor         int      `json:"cursor"`
	Limit          int      `json:"limit"`
}

type Candidate struct {
	Config    enigma.Config `json:"config"`
	Plaintext string        `json:"plaintext"`
}

type Result struct {
	Next        int         `json:"next"`
	Total       int         `json:"total"`
	Tested      int         `json:"tested"`
	Rejected    int         `json:"rejected"`
	Unresolved  int         `json:"unresolved"`
	Done        bool        `json:"done"`
	LastWindows string      `json:"last_windows"`
	LastOrder   []string    `json:"last_order"`
	Candidates  []Candidate `json:"candidates"`
}

func validText(s string) bool {
	for i := range s {
		if s[i] < 'A' || s[i] > 'Z' {
			return false
		}
	}
	return true
}

func orders(r Request) [][]string {
	if !r.Permute {
		return [][]string{r.Rotors}
	}
	a, b, c := r.Rotors[0], r.Rotors[1], r.Rotors[2]
	return [][]string{{a, b, c}, {a, c, b}, {b, a, c}, {b, c, a}, {c, a, b}, {c, b, a}}
}

func baseConfig(r Request, order []string) enigma.Config {
	c := enigma.Config{Reflector: r.Reflector, Plugboard: []string{}}
	for i, name := range order {
		c.Rotors = append(c.Rotors, enigma.RotorConfig{Name: name, Position: "A", Ring: r.Rings[i]})
	}
	return c
}

func Validate(r Request) error {
	if len(r.Ciphertext) < 6 || len(r.Ciphertext) > 500 || !validText(r.Ciphertext) {
		return fmt.Errorf("ciphertext must contain 6–500 uppercase letters A-Z")
	}
	if len(r.Crib) < 6 || len(r.Crib) > 64 || !validText(r.Crib) {
		return fmt.Errorf("crib must contain 6–64 uppercase letters A-Z")
	}
	if r.Offset < 0 || r.Offset > len(r.Ciphertext)-len(r.Crib) {
		return fmt.Errorf("crib alignment is outside the ciphertext")
	}
	if len(r.Rotors) != 3 || len(r.Rings) != 3 {
		return fmt.Errorf("this Bombe searches exactly three moving rotors")
	}
	seen := map[string]bool{}
	for _, name := range r.Rotors {
		found := false
		for _, d := range enigma.Catalog() {
			if d.Name == name && !d.Stationary {
				found = true
			}
		}
		if !found || seen[name] {
			return fmt.Errorf("choose three distinct service rotors I–VIII")
		}
		seen[name] = true
	}
	if r.Reflector != "A" && r.Reflector != "B" && r.Reflector != "C" {
		return fmt.Errorf("choose reflector A, B, or C")
	}
	if r.MaxPairs < 0 || r.MaxPairs > 13 {
		return fmt.Errorf("maximum plugboard cables must be 0–13")
	}
	c := baseConfig(r, r.Rotors)
	c.Plugboard = r.Plugboard
	if _, err := enigma.New(c); err != nil {
		return err
	}
	if !r.KnownPlugboard && len(r.Plugboard) != 0 {
		return fmt.Errorf("use fixed plugboard mode to supply known cables")
	}
	total := Positions
	if r.Permute {
		total *= 6
	}
	if r.Cursor < 0 || r.Cursor > total || r.Limit < 1 || r.Limit > 256 {
		return fmt.Errorf("cursor must be within the search and chunk size must be 1–256")
	}
	return nil
}

type edge struct {
	a, b        int
	permutation [26]int
}

// bind enforces the reciprocal diagonal-board relation S(a)=b => S(b)=a.
func bind(s *[26]int, a, b int) bool {
	if (s[a] >= 0 && s[a] != b) || (s[b] >= 0 && s[b] != a) {
		return false
	}
	s[a], s[b] = b, a
	return true
}

func pairs(s [26]int) []string {
	out := []string{}
	for a, b := range s {
		if b > a {
			out = append(out, string([]byte{byte(a) + 'A', byte(b) + 'A'}))
		}
	}
	return out
}

type solver struct {
	ctx             context.Context
	edges           []edge
	maxPairs, nodes int
	limited         bool
}

func (s *solver) solve(mapping [26]int) ([26]int, bool) {
	s.nodes++
	if s.nodes > NodeLimit {
		s.limited = true
		return mapping, false
	}
	if s.nodes%32 == 0 && s.ctx.Err() != nil {
		s.limited = true
		return mapping, false
	}
	for {
		before := mapping
		for _, e := range s.edges {
			// S(cipher)=R(S(plain)); R is reciprocal as well.
			if mapping[e.a] >= 0 && !bind(&mapping, e.b, e.permutation[mapping[e.a]]) {
				return mapping, false
			}
			if mapping[e.b] >= 0 && !bind(&mapping, e.a, e.permutation[mapping[e.b]]) {
				return mapping, false
			}
		}
		if len(pairs(mapping)) > s.maxPairs {
			return mapping, false
		}
		if mapping == before {
			break
		}
	}
	// Branch on the most connected unresolved menu letter.
	var degree [26]int
	for _, e := range s.edges {
		degree[e.a]++
		degree[e.b]++
	}
	letter := -1
	for i, d := range degree {
		if d > 0 && mapping[i] < 0 && (letter < 0 || d > degree[letter]) {
			letter = i
		}
	}
	if letter < 0 {
		return mapping, true
	}
	// Try self-steckering first, then possible cables; stop after one wiring.
	for j := 0; j < 27; j++ {
		partner := j - 1
		if j == 0 {
			partner = letter
		}
		if j > 0 && partner == letter {
			continue
		}
		if mapping[partner] >= 0 {
			continue
		}
		next := mapping
		if !bind(&next, letter, partner) {
			continue
		}
		if answer, ok := s.solve(next); ok {
			return answer, true
		}
		if s.limited {
			return mapping, false
		}
	}
	return mapping, false
}

// SearchChunk searches message-start windows lexicographically, returning a
// resumable cursor. Ring settings, reflector and crib alignment remain fixed.
// Unknown steckers use bounded constraint propagation: unresolved settings are
// reported separately, never counted as proven contradictions.
func SearchChunk(ctx context.Context, r Request) (Result, error) {
	if err := Validate(r); err != nil {
		return Result{}, err
	}
	allOrders := orders(r)
	result := Result{Next: r.Cursor, Total: len(allOrders) * Positions, Candidates: []Candidate{}}
	for i := range r.Crib {
		if r.Crib[i] == r.Ciphertext[r.Offset+i] {
			result.Next = result.Total
			result.Rejected = result.Total - r.Cursor
			result.Done = true
			return result, nil
		}
	}
	deadline := time.Now().Add(2 * time.Second)
	end := min(r.Cursor+r.Limit, result.Total)
	for cursor := r.Cursor; cursor < end; cursor++ {
		if err := ctx.Err(); err != nil {
			return result, err
		}
		if time.Now().After(deadline) && result.Tested > 0 {
			break
		}
		order := allOrders[cursor/Positions]
		position := cursor % Positions
		windows := []byte{byte(position/676) + 'A', byte(position/26%26) + 'A', byte(position%26) + 'A'}
		c := baseConfig(r, order)
		for i := range c.Rotors {
			c.Rotors[i].Position = string(windows[i])
		}
		m, _ := enigma.New(c)
		// Skip preceding letters with normal Enigma stepping, so stops refer
		// to the message's starting windows, not the crib's starting windows.
		for i := 0; i < r.Offset; i++ {
			m.StepScrambler()
		}
		edges := make([]edge, len(r.Crib))
		for i := range r.Crib {
			edges[i] = edge{int(r.Crib[i] - 'A'), int(r.Ciphertext[r.Offset+i] - 'A'), m.StepScrambler()}
		}
		var mapping [26]int
		for i := range mapping {
			mapping[i] = -1
		}
		matched := false
		if r.KnownPlugboard {
			for i := range mapping {
				mapping[i] = i
			}
			for _, pair := range r.Plugboard {
				a, b := int(pair[0]-'A'), int(pair[1]-'A')
				mapping[a], mapping[b] = b, a
			}
			matched = true
			for _, e := range edges {
				if mapping[e.b] != e.permutation[mapping[e.a]] {
					matched = false
					break
				}
			}
		} else {
			s := solver{ctx: ctx, edges: edges, maxPairs: r.MaxPairs}
			mapping, matched = s.solve(mapping)
			if !matched && s.limited {
				result.Unresolved++
			} else if !matched {
				result.Rejected++
			}
		}
		if matched {
			c.Plugboard = pairs(mapping)
			machine, _ := enigma.New(c)
			plain, _ := machine.Encode(r.Ciphertext)
			result.Candidates = append(result.Candidates, Candidate{c, plain})
		} else if r.KnownPlugboard {
			result.Rejected++
		}
		result.Tested++
		result.Next = cursor + 1
		result.LastWindows = string(windows)
		result.LastOrder = append([]string{}, order...)
	}
	result.Done = result.Next == result.Total
	return result, nil
}
