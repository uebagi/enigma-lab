package enigma

import (
	"fmt"
	"strings"
)

type RotorConfig struct {
	Name     string `json:"name"`
	Position string `json:"position"` // Window letter, A-Z.
	Ring     int    `json:"ring"`     // Ringstellung, 1-26.
}

type Config struct {
	Rotors    []RotorConfig `json:"rotors"`
	Reflector string        `json:"reflector"`
	Plugboard []string      `json:"plugboard"` // Disjoint pairs, e.g. AB, CD.
}

type Stage struct {
	Name   string `json:"name"`
	Input  string `json:"input"`
	Output string `json:"output"`
}

type rotor struct {
	definition       RotorDefinition
	forward, reverse [26]int
	position, ring   int
}

// Machine is mutable; callers must synchronize concurrent access.
type Machine struct {
	rotors      []rotor
	reflector   [26]int
	plugs       [26]int
	config      Config
	firstMoving int
}

func letter(s string) bool { return len(s) == 1 && s[0] >= 'A' && s[0] <= 'Z' }
func mod(n int) int        { return (n%26 + 26) % 26 }

// New accepts any positive rotor count. Stationary Greek wheels must precede
// moving wheels. Repeated rotor types are allowed for experimental machines.
func New(c Config) (*Machine, error) {
	if len(c.Rotors) == 0 {
		return nil, fmt.Errorf("at least one rotor is required")
	}
	wiring, ok := Reflectors()[c.Reflector]
	if !ok {
		return nil, fmt.Errorf("unknown reflector %q", c.Reflector)
	}
	m := &Machine{config: c, firstMoving: len(c.Rotors)}
	m.config.Rotors = append([]RotorConfig(nil), c.Rotors...)
	m.config.Plugboard = append([]string{}, c.Plugboard...)
	for i := 0; i < 26; i++ {
		m.plugs[i] = i
		m.reflector[i] = int(wiring[i] - 'A')
	}
	definitions := map[string]RotorDefinition{}
	for _, d := range Catalog() {
		definitions[d.Name] = d
	}
	for i, rc := range c.Rotors {
		d, exists := definitions[rc.Name]
		if !exists {
			return nil, fmt.Errorf("rotor %d: unknown type %q", i+1, rc.Name)
		}
		if !letter(rc.Position) || rc.Ring < 1 || rc.Ring > 26 {
			return nil, fmt.Errorf("rotor %d: position must be A-Z and ring must be 1-26", i+1)
		}
		if d.Stationary && m.firstMoving < i {
			return nil, fmt.Errorf("stationary rotors must be left of all moving rotors")
		}
		if !d.Stationary && m.firstMoving == len(c.Rotors) {
			m.firstMoving = i
		}
		r := rotor{definition: d, position: int(rc.Position[0] - 'A'), ring: rc.Ring - 1}
		for j := 0; j < 26; j++ {
			r.forward[j] = int(d.Wiring[j] - 'A')
			r.reverse[r.forward[j]] = j
		}
		m.rotors = append(m.rotors, r)
	}
	if m.firstMoving == len(c.Rotors) {
		return nil, fmt.Errorf("at least one moving rotor is required")
	}
	used := [26]bool{}
	for _, pair := range c.Plugboard {
		if len(pair) != 2 || !letter(pair[:1]) || !letter(pair[1:]) || pair[0] == pair[1] {
			return nil, fmt.Errorf("plugboard pairs must contain two different letters A-Z")
		}
		a, b := pair[0]-'A', pair[1]-'A'
		if used[a] || used[b] {
			return nil, fmt.Errorf("plugboard letter may be used only once")
		}
		used[a], used[b] = true, true
		m.plugs[a], m.plugs[b] = int(b), int(a)
	}
	return m, nil
}

func (m *Machine) step() {
	last := len(m.rotors) - 1
	steps := make([]bool, len(m.rotors))
	steps[last] = true
	// Evaluate every notch before moving any wheel. A notch engages both its
	// own pawl and the pawl to the left; the leftmost moving wheel has no
	// left neighbour to engage, so its own notch cannot cause a self-step.
	for i := m.firstMoving + 1; i <= last; i++ {
		if strings.ContainsRune(m.rotors[i].definition.Notches, rune('A'+m.rotors[i].position)) {
			steps[i], steps[i-1] = true, true
		}
	}
	for i := range m.rotors {
		if steps[i] {
			m.rotors[i].position = mod(m.rotors[i].position + 1)
		}
	}
}

func (r *rotor) mapLetter(n int, reverse bool) int {
	offset := r.position - r.ring
	if reverse {
		return mod(r.reverse[mod(n+offset)] - offset)
	}
	return mod(r.forward[mod(n+offset)] - offset)
}

// StepScrambler advances the wheels and returns the bare rotor/reflector
// permutation, excluding the plugboard. Values are alphabet indices 0-25.
// This lets a Bombe menu test hypothetical plugboard connections separately.
func (m *Machine) StepScrambler() [26]int {
	m.step()
	var permutation [26]int
	for key := 0; key < 26; key++ {
		n := key
		for i := len(m.rotors) - 1; i >= 0; i-- {
			n = m.rotors[i].mapLetter(n, false)
		}
		n = m.reflector[n]
		for i := range m.rotors {
			n = m.rotors[i].mapLetter(n, true)
		}
		permutation[key] = n
	}
	return permutation
}

// Press steps the rotors, then returns the lamp letter and electrical trace.
// Invalid input does not advance the machine.
func (m *Machine) Press(key byte) (byte, []Stage, error) {
	if key < 'A' || key > 'Z' {
		return 0, nil, fmt.Errorf("key must be A-Z")
	}
	m.step()
	n := int(key - 'A')
	trace := make([]Stage, 0, 2*len(m.rotors)+3)
	stage := func(name string, next int) {
		trace = append(trace, Stage{name, string(rune('A' + n)), string(rune('A' + next))})
		n = next
	}
	stage("Plugboard in", m.plugs[n])
	for i := len(m.rotors) - 1; i >= 0; i-- {
		stage(fmt.Sprintf("Rotor %d (%s) forward", i+1, m.rotors[i].definition.Name), m.rotors[i].mapLetter(n, false))
	}
	stage("Reflector "+m.config.Reflector, m.reflector[n])
	for i := range m.rotors {
		stage(fmt.Sprintf("Rotor %d (%s) return", i+1, m.rotors[i].definition.Name), m.rotors[i].mapLetter(n, true))
	}
	stage("Plugboard out", m.plugs[n])
	return byte(n) + 'A', trace, nil
}

// Encode validates the whole string before advancing. Lowercase, spaces and
// punctuation are rejected: callers choose their own message preparation.
func (m *Machine) Encode(text string) (string, error) {
	for i := range text {
		if text[i] < 'A' || text[i] > 'Z' {
			return "", fmt.Errorf("text must contain only A-Z")
		}
	}
	var out strings.Builder
	for i := range text {
		c, _, _ := m.Press(text[i])
		out.WriteByte(c)
	}
	return out.String(), nil
}

// Config returns a deep copy of the current window positions and settings.
func (m *Machine) Config() Config {
	c := m.config
	c.Rotors = append([]RotorConfig(nil), c.Rotors...)
	c.Plugboard = append([]string{}, c.Plugboard...)
	for i, r := range m.rotors {
		c.Rotors[i].Position = string(rune('A' + r.position))
	}
	return c
}
