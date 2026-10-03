package enigma

import (
	"strings"
	"testing"
)

func mustNew(t *testing.T, c Config) *Machine {
	t.Helper()
	m, err := New(c)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func windows(m *Machine) string {
	var s string
	for _, r := range m.Config().Rotors {
		s += r.Position
	}
	return s
}

func TestKnownM3Vectors(t *testing.T) {
	for _, tc := range []struct{ plain, cipher string }{{"AAAAA", "BDZGO"}, {"HELLOWORLD", "ILBDAAMTAZ"}} {
		m := mustNew(t, M3())
		got, err := m.Encode(tc.plain)
		if err != nil || got != tc.cipher {
			t.Fatalf("%s: got %s, %v; want %s", tc.plain, got, err, tc.cipher)
		}
		m = mustNew(t, M3())
		got, _ = m.Encode(tc.cipher)
		if got != tc.plain {
			t.Fatalf("decryption got %s", got)
		}
	}
}

func TestDoubleStep(t *testing.T) {
	c := M3()
	c.Rotors = []RotorConfig{{"III", "A", 1}, {"II", "D", 1}, {"I", "O", 1}}
	m := mustNew(t, c)
	for _, want := range []string{"ADP", "ADQ", "AER", "BFS", "BFT"} {
		m.Press('A')
		if got := windows(m); got != want {
			t.Fatalf("got %s; want %s", got, want)
		}
	}
}

func TestRingDoesNotShiftWindowTurnover(t *testing.T) {
	c := M3()
	c.Rotors[2] = RotorConfig{"I", "Q", 7}
	m := mustNew(t, c)
	m.Press('A')
	if got := windows(m); got != "ABR" {
		t.Fatalf("got %s; want ABR", got)
	}
}

func TestNavalDualNotch(t *testing.T) {
	for _, name := range []string{"VI", "VII", "VIII"} {
		for _, notch := range []string{"M", "Z"} {
			c := M3()
			c.Rotors[2] = RotorConfig{name, notch, 1}
			m := mustNew(t, c)
			m.Press('A')
			if m.Config().Rotors[1].Position != "B" {
				t.Fatalf("%s at %s did not carry", name, notch)
			}
		}
	}
}

func TestM4CompatibilityAndStationaryWheel(t *testing.T) {
	// Beta at A, ring A plus thin B is electrically equivalent to wide B.
	m3, m4 := mustNew(t, M3()), mustNew(t, M4())
	text := strings.Repeat("HELLOWORLD", 2000)
	a, _ := m3.Encode(text)
	b, _ := m4.Encode(text)
	if a != b {
		t.Fatal("M4 Beta-A/thin-B compatibility failed")
	}
	if m4.Config().Rotors[0].Position != "A" {
		t.Fatal("Greek wheel stepped")
	}
}

func TestReciprocityArbitraryCounts(t *testing.T) {
	for _, count := range []int{1, 2, 3, 4, 5, 12, 64} {
		c := M3()
		c.Rotors = nil
		c.Plugboard = []string{"AZ", "BY", "CX", "DW", "EV", "FU"}
		for i := 0; i < count; i++ {
			c.Rotors = append(c.Rotors, RotorConfig{"I", string(rune('A' + i%26)), i%26 + 1})
		}
		m := mustNew(t, c)
		plain := strings.Repeat("THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG", 4)
		cipher, _ := m.Encode(plain)
		for i := range cipher {
			if cipher[i] == plain[i] {
				t.Fatalf("count %d: self encipherment", count)
			}
		}
		decoded, _ := mustNew(t, c).Encode(cipher)
		if decoded != plain {
			t.Fatalf("count %d: roundtrip failed", count)
		}
	}
}

func TestInvalidConfig(t *testing.T) {
	tests := []func(*Config){
		func(c *Config) { c.Rotors = nil },
		func(c *Config) { c.Rotors[0].Name = "bad" },
		func(c *Config) { c.Rotors[0].Position = "AA" },
		func(c *Config) { c.Rotors[0].Ring = 0 },
		func(c *Config) { c.Rotors[0].Ring = 27 },
		func(c *Config) { c.Reflector = "bad" },
		func(c *Config) { c.Plugboard = []string{"AB", "AC"} },
		func(c *Config) { c.Plugboard = []string{"AA"} },
		func(c *Config) { c.Plugboard = []string{"A"} },
		func(c *Config) { c.Plugboard = []string{"Ab"} },
		func(c *Config) { c.Rotors[1].Name = "Beta" },
		func(c *Config) { c.Rotors = []RotorConfig{{"Beta", "A", 1}} },
	}
	for i, change := range tests {
		c := M3()
		change(&c)
		if _, err := New(c); err == nil {
			t.Errorf("case %d accepted", i)
		}
	}
}

func TestInvalidInputDoesNotStep(t *testing.T) {
	m := mustNew(t, M3())
	if _, err := m.Encode("AB C"); err == nil {
		t.Fatal("invalid message accepted")
	}
	if _, _, err := m.Press('!'); err == nil {
		t.Fatal("invalid key accepted")
	}
	if windows(m) != "AAA" {
		t.Fatal("invalid input advanced rotors")
	}
}

func TestConfigIsolationAndTrace(t *testing.T) {
	c := M3()
	m := mustNew(t, c)
	c.Rotors[0].Name = "unknown"
	snapshot := m.Config()
	snapshot.Rotors[0].Position = "Z"
	lamp, trace, err := m.Press('A')
	if err != nil || lamp != 'B' || len(trace) != 9 {
		t.Fatalf("lamp %c, trace %d, err %v", lamp, len(trace), err)
	}
	if trace[0].Input != "A" || trace[len(trace)-1].Output != "B" || windows(m) != "AAB" {
		t.Fatal("state/trace mismatch")
	}
	for i := 1; i < len(trace); i++ {
		if trace[i-1].Output != trace[i].Input {
			t.Fatal("disconnected trace")
		}
	}
}

func TestBareScrambler(t *testing.T) {
	c := M4()
	c.Rotors[2].Position = "E"
	c.Rotors[3].Position = "V"
	c.Rotors[1].Ring = 7
	scrambler := mustNew(t, c)
	permutation := scrambler.StepScrambler()
	for i := 0; i < 26; i++ {
		m := mustNew(t, c)
		lamp, _, _ := m.Press(byte(i) + 'A')
		if permutation[i] != int(lamp-'A') || permutation[permutation[i]] != i || permutation[i] == i {
			t.Fatalf("bad scrambler permutation for %d", i)
		}
	}
}
