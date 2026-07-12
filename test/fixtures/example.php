<?php

namespace App;

interface DummyInterface
{
    public function interfaceMethod();
}

class BaseClasss implements DummyInterface
{
    use HelperTrait;

    public function interfaceMethod()
    {
        // ...
    }

    public function otherMethod()
    {
        // ...
    }

    private function secret()
    {
        // ...
    }
}

class ChildClasss extends BaseClasss implements DummyInterface
{
    public function interfaceMethod()
    {
        // ...
    }

    public function otherMethod()
    {
        // ...
    }
}

trait HelperTrait
{
    public function help()
    {
        // ...
    }
}

(new ChildClasss())->interfaceMethod();
(new ChildClasss())->otherMethod();
