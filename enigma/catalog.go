// Package enigma emulates the electrical path and pawl stepping of an Enigma.
// Rotor slices always run left to right, from reflector to keyboard.
package enigma

type RotorDefinition struct {
	Name       string `json:"name"`
	Wiring     string `json:"wiring"`
	Notches    string `json:"notches"`
	Stationary bool   `json:"stationary"`
}

// Catalog returns a fresh copy of the historical service rotor definitions.
func Catalog() []RotorDefinition {
	return []RotorDefinition{
		{"I", "EKMFLGDQVZNTOWYHXUSPAIBRCJ", "Q", false},
		{"II", "AJDKSIRUXBLHWTMCQGZNPYFVOE", "E", false},
		{"III", "BDFHJLCPRTXVZNYEIWGAKMUSQO", "V", false},
		{"IV", "ESOVPZJAYQUIRHXLNFTGKDCMWB", "J", false},
		{"V", "VZBRGITYUPSDNHLXAWMJQOFECK", "Z", false},
		{"VI", "JPGVOUMFYQBENHZRDKASXLICTW", "ZM", false},
		{"VII", "NZJHGRCXMYSWBOUFAIVLPEKQDT", "ZM", false},
		{"VIII", "FKQHTLXOCBJSPDZRAMEWNIUYGV", "ZM", false},
		{"Beta", "LEYJVCNIXWPBQMDRTAKZGFUHOS", "", true},
		{"Gamma", "FSOKANUERHMBTIYCWLQPZXVGJD", "", true},
	}
}

func Reflectors() map[string]string {
	return map[string]string{
		"A":      "EJMZALYXVBWFCRQUONTSPIKHGD",
		"B":      "YRUHQSLDPXNGOKMIEBFZCWVJAT",
		"C":      "FVPJIAOYEDRZXWGCTKUQSBNMHL",
		"B-thin": "ENKQAUYWJICOPBLMDXZVFTHRGS",
		"C-thin": "RDOBJNTKVEHMLFCWZAXGYIPSUQ",
	}
}

func M3() Config {
	return Config{Rotors: []RotorConfig{{"I", "A", 1}, {"II", "A", 1}, {"III", "A", 1}}, Reflector: "B", Plugboard: []string{}}
}

func M4() Config {
	c := M3()
	c.Rotors = append([]RotorConfig{{"Beta", "A", 1}}, c.Rotors...)
	c.Reflector = "B-thin"
	return c
}
