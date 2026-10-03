package main

import (
	"flag"
	"log"
	"net/http"
	"time"

	"enigma/controller"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "HTTP listen address")
	flag.Parse()
	server := &http.Server{Addr: *addr, Handler: controller.NewHandler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("Enigma simulator: http://%s", *addr)
	log.Fatal(server.ListenAndServe())
}
