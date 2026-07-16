# Vega Qt

Interface Qt 6 oficial e independente do Vega. Ela compartilha apenas o serviço de sistema
`vegad` e o contrato `org.lyraos.Vega1` com a interface GTK.

## Desenvolvimento

Requer CMake 3.22+, compilador C++20, Qt 6.4+ com Core, Widgets, D-Bus e Test,
além de `secret-tool`/Secret Service para armazenar chaves do Assistente. Sem um
keyring disponível, a interface recusa o salvamento e não usa fallback em arquivo.

```sh
cmake -S . -B build -DBUILD_TESTING=ON
cmake --build build
ctest --test-dir build --output-on-failure
QT_QPA_PLATFORM=wayland ./build/lyra-vega-qt
```

Use `QT_QPA_PLATFORM=xcb` para testar X11. Configurações pertencem a `LyraOS/VegaQt` e não
colidem com `vega-gtk`. A UI nunca executa comandos privilegiados: toda mutação passa pelo
system bus e pelo polkit no `vegad`.
