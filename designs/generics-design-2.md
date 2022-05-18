# Generics Design

## Test Cases
---

### Anonymous Generic Class Object Construction

Should support constructing anonymous objects of Generic Classes
in arbitrary expressions. For starters we plan to do this with
explicit type annotations:

```python
T = TypeVar('T')

class Box(Generic[T]):
    n : T = __ZERO__

class Rat():
    n : int = 0

    def foo()

i : int = 0

i = i + Box[int]().n + Box[Rat]()n.n
```

### Anonymous Generic Class Object Construction with User Defined Class

Explicit type annotations for Generic Class construction should allow user defined
class types.

```python
T = TypeVar('T')

class Box(Generic[T]):
    n : T = __ZERO__

    def new(self: Box[T], n: T) -> Box[T]:
      self.n = n
      return self

class Rat():
    n : int = 0

i : int = 0

i = i + Box[Rat]().new(Rat()).n.n
```

### Superclass Bounds for Type-Variable Definitions

Type-Variable definitions can use an alternate form of specifying
constraints in the form of a single upper bound class type.

```python
T = TypeVar('T', bound=Super)

class Super():
  pass

class Sub1(Super):
  pass

class Sub2(Super):
  pass

class Rat():
  pass

class Box(Generic[T]):
  a: T = __ZERO__
  pass

b1 : Box[Super] = None
b2 : Box[Sub1] = None
b3 : Box[Sub2] = None
b4 : Box[Rat] = None # ERROR
```

### Inheriting from Generic Classes with a Type Argument

Should allow super-classes that have type arguments.

```python
T = TypeVar('T')

class Box(Generic[T]):
    n : T = __ZERO__

class IBox(Box[int]):
  pass
```

### Inheriting from Generic Classes with a Type Parameter

```python
T = TypeVar('T')

class Box(Generic[T]):
    n : T = __ZERO__

class GBox(Generic[T], Box[T]):
  pass
```

```python
T = TypeVar('T')
U = TypeVar('U')

class Pair(Generic[T, U]):
    fst : T = __ZERO__
    snd : U = __ZERO__

class GBox(Generic[U], Pair[int, U]):
  pass
```

### Generic Functions

Should allow TypeVariables in parameter and return types in Functions.
This should also work seamlessly with First-Class and Nested Functions.

```python
T = TypeVar('T')

def id(t: T) -> T:
    return t
```
